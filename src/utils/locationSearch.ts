import type { BoundaryGeometry, GeocodeBounds, GeocodedPlace, Position } from "@/types/geospatial";

interface NominatimResult {
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: string[];
  type?: string;
  addresstype?: string;
  class?: string;
  importance?: number;
  geojson?: unknown;
}

const SEARCH_CACHE_LIMIT = 40;
const MIN_REQUEST_INTERVAL_MS = 1_000;
const searchCache = new Map<string, GeocodedPlace[]>();
const reverseCache = new Map<string, string>();
let lastRequestAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

function isPosition(value: unknown): value is Position {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function isRing(value: unknown): value is Position[] {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

export function isBoundaryGeometry(value: unknown): value is BoundaryGeometry {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type === "Polygon") {
    return Array.isArray(geometry.coordinates)
      && geometry.coordinates.length > 0
      && geometry.coordinates.every(isRing)
      && geometry.coordinates.reduce((count, ring) => count + ring.length, 0) <= 20_000;
  }
  if (geometry.type === "MultiPolygon") {
    return Array.isArray(geometry.coordinates)
      && geometry.coordinates.length > 0
      && geometry.coordinates.every((polygon) =>
        Array.isArray(polygon) && polygon.length > 0 && polygon.every(isRing)
      )
      && geometry.coordinates.reduce(
        (count, polygon) => count + polygon.reduce((sum, ring) => sum + ring.length, 0),
        0,
      ) <= 20_000;
  }
  return false;
}

function toPlace(result: NominatimResult): GeocodedPlace | null {
  if (typeof result.display_name !== "string" || !Array.isArray(result.boundingbox)) return null;
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return null;
  }

  const [south, north, west, east] = result.boundingbox.map(Number);
  const bounds = [south, north, west, east].every(Number.isFinite)
      && south >= -90 && north <= 90 && west >= -180 && east <= 180
      && south <= north && west <= east
    ? [[south, west], [north, east]] as GeocodeBounds
    : undefined;
  const nameParts = result.display_name.split(",").map((part) => part.trim());
  const name = nameParts.slice(0, result.addresstype === "country" ? 1 : 2).join(", ");

  return {
    name,
    displayName: result.display_name,
    lat,
    lng,
    type: result.addresstype || result.type || result.class || "place",
    bounds,
    geometry: isBoundaryGeometry(result.geojson) ? result.geojson : undefined,
    source: "nominatim",
  };
}

function prioritizeResults(results: GeocodedPlace[], query: string): GeocodedPlace[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return [...results].sort((a, b) => {
    const aExact = a.name.toLocaleLowerCase() === normalizedQuery ? 1 : 0;
    const bExact = b.name.toLocaleLowerCase() === normalizedQuery ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return 0;
  });
}

async function waitForRequestSlot(): Promise<void> {
  const scheduled = requestQueue.then(async () => {
    const waitMs = Math.max(0, lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestAt = Date.now();
  });
  requestQueue = scheduled.catch(() => undefined);
  await scheduled;
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<GeocodedPlace[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  if (normalizedQuery.length < 2) return [];
  if (normalizedQuery.length > 200) throw new Error("Search is limited to 200 characters.");

  const cacheKey = normalizedQuery.toLocaleLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  await waitForRequestSlot();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("viewbox", "-18,37,52,-35");
  url.searchParams.set("bounded", "0");
  url.searchParams.set("limit", "8");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("polygon_threshold", "0.01");

  const response = await fetcher(url, {
    headers: { "Accept-Language": "en" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Location service returned ${response.status}. Please try again shortly.`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Location service returned an invalid response.");

  const places = prioritizeResults(
    payload
      .filter((result): result is NominatimResult => !!result && typeof result === "object")
      .map(toPlace)
      .filter((place): place is GeocodedPlace => place !== null),
    normalizedQuery,
  );

  if (searchCache.size >= SEARCH_CACHE_LIMIT) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(cacheKey, places);
  return places;
}

export async function reverseLookup(
  lat: number,
  lng: number,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached) return cached;

  await waitForRequestSlot();
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "10");

  const response = await fetcher(url, {
    headers: { "Accept-Language": "en" },
    signal,
  });
  if (!response.ok) throw new Error(`Reverse geocoding returned ${response.status}.`);

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("Reverse geocoder returned an invalid response.");
  const displayName = (payload as { display_name?: unknown }).display_name;
  if (typeof displayName !== "string" || !displayName.trim()) {
    throw new Error("No place name is available at these coordinates.");
  }

  const name = displayName.split(",").slice(0, 3).map((part) => part.trim()).join(", ");
  if (reverseCache.size >= SEARCH_CACHE_LIMIT) {
    const oldestKey = reverseCache.keys().next().value;
    if (oldestKey) reverseCache.delete(oldestKey);
  }
  reverseCache.set(cacheKey, name);
  return name;
}
