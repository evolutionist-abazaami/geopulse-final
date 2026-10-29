export type AoiPosition = [number, number];

export type AoiGeometry =
  | { type: "Polygon"; coordinates: AoiPosition[][] }
  | { type: "MultiPolygon"; coordinates: AoiPosition[][][] };

export interface AoiBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const MAX_AOI_VERTICES = 20_000;
const MAX_AOI_AREA_KM2 = 5_000_000;
const EARTH_RADIUS_METERS = 6_371_008.8;

function isPosition(value: unknown): value is AoiPosition {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function closeRing(ring: AoiPosition[]): AoiPosition[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

export function validateAoiGeometry(value: unknown): AoiGeometry {
  if (!value || typeof value !== "object") {
    throw new Error("Analysis boundary must be a GeoJSON Polygon or MultiPolygon.");
  }
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    throw new Error("Analysis boundary must be a GeoJSON Polygon or MultiPolygon.");
  }

  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0) {
    throw new Error("Analysis boundary contains no polygon rings.");
  }

  let vertexCount = 0;
  const normalizedPolygons = polygons.map((polygon) => {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new Error("Analysis boundary contains an empty polygon.");
    }
    return polygon.map((ring) => {
      if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isPosition)) {
        throw new Error("Each boundary ring must have at least four valid longitude/latitude positions.");
      }
      vertexCount += ring.length;
      if (vertexCount > MAX_AOI_VERTICES) {
        throw new Error(`Analysis boundary exceeds the ${MAX_AOI_VERTICES.toLocaleString()}-vertex limit.`);
      }
      return closeRing(ring);
    });
  });

  const normalized: AoiGeometry = geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: normalizedPolygons[0] }
    : { type: "MultiPolygon", coordinates: normalizedPolygons };
  const bounds = getAoiBounds(normalized);
  if (!bounds || bounds.east - bounds.west > 180) {
    throw new Error("Analysis boundary has an invalid or unsupported geographic extent.");
  }
  const areaKm2 = getAoiAreaKm2(normalized);
  if (!Number.isFinite(areaKm2) || areaKm2 <= 0 || areaKm2 > MAX_AOI_AREA_KM2) {
    throw new Error(`Analysis boundary must cover between 0 and ${MAX_AOI_AREA_KM2.toLocaleString()} km².`);
  }
  return normalized;
}

export function getAoiBounds(geometry: AoiGeometry): AoiBounds | null {
  const positions = geometry.type === "Polygon"
    ? geometry.coordinates.flat(1)
    : geometry.coordinates.flat(2);
  if (positions.length === 0) return null;

  return positions.reduce<AoiBounds>((bounds, [lng, lat]) => ({
    west: Math.min(bounds.west, lng),
    south: Math.min(bounds.south, lat),
    east: Math.max(bounds.east, lng),
    north: Math.max(bounds.north, lat),
  }), {
    west: Infinity,
    south: Infinity,
    east: -Infinity,
    north: -Infinity,
  });
}

function ringAreaKm2(ring: AoiPosition[]): number {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [lng1, lat1] = ring[index];
    const [lng2, lat2] = ring[(index + 1) % ring.length];
    total += (lng2 - lng1) * Math.PI / 180
      * (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
  }
  return Math.abs(total * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS / 2) / 1_000_000;
}

export function getAoiAreaKm2(geometry: AoiGeometry): number {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.reduce((area, polygon) => {
    const outerArea = ringAreaKm2(polygon[0]);
    const holesArea = polygon.slice(1).reduce((sum, ring) => sum + ringAreaKm2(ring), 0);
    return area + Math.max(0, outerArea - holesArea);
  }, 0);
}
