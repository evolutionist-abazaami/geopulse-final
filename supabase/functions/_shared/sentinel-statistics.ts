import {
  AOI_HALF_WIDTH_DEGREES,
  EXCLUDED_SCL_CLASSES,
  MAX_CLOUD_COVERAGE_PERCENT,
  STATISTICS_GRID_SIZE,
} from "./analysis-constants.ts";
import type { SpectralBandStats } from "./satellite-analysis.ts";
import type { AoiGeometry } from "./geojson.ts";
import type { AoiBounds } from "./geojson.ts";

export interface SpectralStatsResult {
  ndvi: SpectralBandStats | null;
  ndwi: SpectralBandStats | null;
  nbr: SpectralBandStats | null;
  sampleCount: number;
  validPixelRatio: number;
}

const STATISTICS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03","B04","B08","B12","SCL","dataMask"] }],
    output: [
      { id: "ndvi", bands: 1 },
      { id: "ndwi", bands: 1 },
      { id: "nbr", bands: 1 },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function isCloud(scl) { return [${EXCLUDED_SCL_CLASSES.join(",")}].includes(scl); }
function evaluatePixel(s) {
  let ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
  let ndwi = (s.B03 - s.B08) / (s.B03 + s.B08);
  let nbr = (s.B08 - s.B12) / (s.B08 + s.B12);
  let mask = isCloud(s.SCL) ? 0 : s.dataMask;
  return { ndvi: [ndvi], ndwi: [ndwi], nbr: [nbr], dataMask: [mask] };
}`;

export async function fetchSpectralStatistics(
  token: string,
  lat: number,
  lng: number,
  from: Date,
  to: Date,
  fetcher: typeof fetch = fetch,
  geometry?: AoiGeometry,
  geometryBounds?: AoiBounds,
): Promise<SpectralStatsResult | null> {
  const bbox = geometryBounds
    ? [geometryBounds.west, geometryBounds.south, geometryBounds.east, geometryBounds.north]
    : [
      lng - AOI_HALF_WIDTH_DEGREES,
      lat - AOI_HALF_WIDTH_DEGREES,
      lng + AOI_HALF_WIDTH_DEGREES,
      lat + AOI_HALF_WIDTH_DEGREES,
    ];
  const windowDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));

  let response: Response;
  try {
    response = await fetcher("https://sh.dataspace.copernicus.eu/api/v1/statistics", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        input: {
          bounds: {
            ...(geometry ? { geometry } : { bbox }),
            properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
          },
          data: [{
            type: "sentinel-2-l2a",
            dataFilter: { maxCloudCoverage: MAX_CLOUD_COVERAGE_PERCENT },
          }],
        },
        aggregation: {
          timeRange: { from: from.toISOString(), to: to.toISOString() },
          aggregationInterval: { of: `P${windowDays}D` },
          evalscript: STATISTICS_EVALSCRIPT,
          width: STATISTICS_GRID_SIZE,
          height: STATISTICS_GRID_SIZE,
        },
      }),
    });
  } catch (error) {
    console.error("Sentinel Hub statistics request failed:", error instanceof Error ? error.message : error);
    return null;
  }

  if (!response.ok) {
    console.error("Sentinel Hub statistics API error:", response.status);
    return null;
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    console.error(
      "Sentinel Hub statistics response was not valid JSON:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }

  if (!json || typeof json !== "object" || !("data" in json)) return null;
  const data = (json as { data?: { outputs?: Record<string, unknown> }[] }).data;
  const outputs = data?.[0]?.outputs;
  if (!outputs) {
    console.warn("Sentinel Hub statistics returned no data interval - likely no cloud-free scenes in this window.");
    return null;
  }

  const extractBand = (id: string): SpectralBandStats | null => {
    const output = outputs[id];
    if (!output || typeof output !== "object") return null;
    const bands = (output as { bands?: Record<string, { stats?: Record<string, unknown> }> }).bands;
    const stats = bands?.B0?.stats;
    if (!stats || typeof stats.mean !== "number" || typeof stats.min !== "number" || typeof stats.max !== "number") {
      return null;
    }
    return { mean: stats.mean, min: stats.min, max: stats.max };
  };

  const ndviOutput = outputs.ndvi;
  const ndviBands = ndviOutput && typeof ndviOutput === "object"
    ? (ndviOutput as { bands?: Record<string, { stats?: Record<string, unknown> }> }).bands
    : undefined;
  const ndviStats = ndviBands?.B0?.stats;
  const sampleCount = typeof ndviStats?.sampleCount === "number" ? ndviStats.sampleCount : 0;
  const noDataCount = typeof ndviStats?.noDataCount === "number" ? ndviStats.noDataCount : 0;

  return {
    ndvi: extractBand("ndvi"),
    ndwi: extractBand("ndwi"),
    nbr: extractBand("nbr"),
    sampleCount,
    validPixelRatio: sampleCount > 0 ? (sampleCount - noDataCount) / sampleCount : 0,
  };
}
