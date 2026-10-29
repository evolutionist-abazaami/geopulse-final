import {
  AOI_HALF_WIDTH_DEGREES,
  STATISTICS_GRID_SIZE,
} from "./analysis-constants.ts";
import type { SpectralStatsResult } from "./sentinel-statistics.ts";
import type { SpectralBandStats } from "./satellite-analysis.ts";
import type { AoiBounds, AoiGeometry } from "./geojson.ts";

export interface LandsatStatsSource {
  type: string;
  sensor: string;
  collectionIds: string[];
  nativeBandResolutionsMeters: Record<string, number>;
  bands: {
    green: string;
    red: string;
    nir: string;
    swir2: string;
  };
}

interface EarthEngineImage {
  add(value: number | EarthEngineImage): EarthEngineImage;
  addBands(image: EarthEngineImage): EarthEngineImage;
  and(image: EarthEngineImage): EarthEngineImage;
  bitwiseAnd(value: number): EarthEngineImage;
  divide(image: EarthEngineImage): EarthEngineImage;
  eq(value: number): EarthEngineImage;
  multiply(value: number): EarthEngineImage;
  neq(value: number): EarthEngineImage;
  reduceRegion(options: Record<string, unknown>): EarthEngineDictionary;
  rename(name: string): EarthEngineImage;
  select(bands: string | string[]): EarthEngineImage;
  subtract(image: EarthEngineImage): EarthEngineImage;
  updateMask(mask: EarthEngineImage): EarthEngineImage;
}

interface EarthEngineDictionary {
  evaluate(callback: (value: unknown, error?: string) => void): void;
  get(key: string): unknown;
}

interface EarthEngineCollection {
  filterBounds(geometry: unknown): EarthEngineCollection;
  filterDate(from: string, to: string): EarthEngineCollection;
  map(callback: (image: EarthEngineImage) => EarthEngineImage): EarthEngineCollection;
  median(): EarthEngineImage;
  merge(collection: EarthEngineCollection): EarthEngineCollection;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

interface EarthEngineClient {
  data: {
    authenticateViaPrivateKey(
      key: ServiceAccountKey,
      success: () => void,
      failure: (error: unknown) => void,
      scopes?: string[],
    ): void;
  };
  initialize(
    baseUrl?: string | null,
    tileUrl?: string | null,
    success?: () => void,
    failure?: (error: unknown) => void,
    xsrfToken?: string | null,
    project?: string,
  ): void;
  Geometry: {
    (geoJson: unknown): unknown;
    Rectangle(coordinates: number[], crs?: string, geodesic?: boolean): unknown;
  };
  Image: {
    constant(value: number): EarthEngineImage;
  };
  ImageCollection: new (collectionId: string) => EarthEngineCollection;
  Dictionary: new (value: Record<string, unknown>) => EarthEngineDictionary;
  Reducer: {
    count(): unknown;
    max(): unknown;
    mean(): unknown;
    min(): unknown;
  };
}

const SCALE_FACTOR = 0.0000275;
const SCALE_OFFSET = -0.2;
const LANDSAT_TM_START = new Date("1982-08-22T00:00:00.000Z");
const LANDSAT_ETM_START = new Date("1999-04-15T00:00:00.000Z");
const LANDSAT_OLI_START = new Date("2013-02-11T00:00:00.000Z");

const LANDSAT_TM_SOURCE: LandsatStatsSource = {
  type: "landsat-tm-l2",
  sensor: "Landsat 4/5 TM Collection 2 Level-2",
  collectionIds: ["LANDSAT/LT04/C02/T1_L2", "LANDSAT/LT05/C02/T1_L2"],
  nativeBandResolutionsMeters: { SR_B2: 30, SR_B3: 30, SR_B4: 30, SR_B5: 30, SR_B7: 30 },
  bands: { green: "SR_B2", red: "SR_B3", nir: "SR_B4", swir2: "SR_B7" },
};

const LANDSAT_ETM_SOURCE: LandsatStatsSource = {
  type: "landsat-etm-l2",
  sensor: "Landsat 7 ETM+ Collection 2 Level-2",
  collectionIds: ["LANDSAT/LE07/C02/T1_L2"],
  nativeBandResolutionsMeters: { SR_B2: 30, SR_B3: 30, SR_B4: 30, SR_B5: 30, SR_B7: 30 },
  bands: { green: "SR_B2", red: "SR_B3", nir: "SR_B4", swir2: "SR_B7" },
};

const LANDSAT_OLI_SOURCE: LandsatStatsSource = {
  type: "landsat-ot-l2",
  sensor: "Landsat 8/9 OLI-TIRS Collection 2 Level-2",
  collectionIds: ["LANDSAT/LC08/C02/T1_L2", "LANDSAT/LC09/C02/T1_L2"],
  nativeBandResolutionsMeters: { SR_B3: 30, SR_B4: 30, SR_B5: 30, SR_B6: 30, SR_B7: 30 },
  bands: { green: "SR_B3", red: "SR_B4", nir: "SR_B5", swir2: "SR_B7" },
};

let initialization: Promise<EarthEngineClient> | null = null;

export function getLandsatSourceForDate(date: Date): LandsatStatsSource | null {
  if (date >= LANDSAT_OLI_START) return LANDSAT_OLI_SOURCE;
  if (date >= LANDSAT_ETM_START) return LANDSAT_ETM_SOURCE;
  if (date >= LANDSAT_TM_START) return LANDSAT_TM_SOURCE;
  return null;
}

export function hasEarthEngineCredentials(): boolean {
  return Boolean(
    Deno.env.get("EARTH_ENGINE_PROJECT_ID")
    && Deno.env.get("EARTH_ENGINE_SERVICE_ACCOUNT_JSON"),
  );
}

export function parseLandsatStatistics(value: unknown): SpectralStatsResult | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  const parseBand = (name: string): SpectralBandStats | null => {
    const mean = result[`${name}Mean`];
    const min = result[`${name}Min`];
    const max = result[`${name}Max`];
    if (typeof mean !== "number" || typeof min !== "number" || typeof max !== "number") return null;
    return { mean, min, max };
  };

  const totalCount = result.totalCount;
  const validCount = result.validCount;
  if (typeof totalCount !== "number" || typeof validCount !== "number" || totalCount <= 0) return null;

  return {
    ndvi: parseBand("ndvi"),
    ndwi: parseBand("ndwi"),
    nbr: parseBand("nbr"),
    sampleCount: totalCount,
    validPixelRatio: Math.max(0, Math.min(1, validCount / totalCount)),
  };
}

function initializeEarthEngine(): Promise<EarthEngineClient> {
  if (initialization) return initialization;

  const projectId = Deno.env.get("EARTH_ENGINE_PROJECT_ID");
  const keyJson = Deno.env.get("EARTH_ENGINE_SERVICE_ACCOUNT_JSON");
  if (!projectId || !keyJson) {
    return Promise.reject(new Error("Earth Engine project and service account secrets are required."));
  }

  let key: ServiceAccountKey;
  try {
    const parsed: unknown = JSON.parse(keyJson);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid service account JSON.");
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.client_email !== "string" || typeof candidate.private_key !== "string") {
      throw new Error("Service account JSON must include client_email and private_key.");
    }
    key = { client_email: candidate.client_email, private_key: candidate.private_key };
  } catch (error) {
    return Promise.reject(new Error(
      `Invalid Earth Engine service account secret: ${error instanceof Error ? error.message : String(error)}`,
    ));
  }

  initialization = (async () => {
    const eeModule = await import("@google/earthengine");
    const ee = eeModule.default as unknown as EarthEngineClient;
    await new Promise<void>((resolve, reject) => {
      ee.data.authenticateViaPrivateKey(
        key,
        resolve,
        reject,
        ["https://www.googleapis.com/auth/earthengine"],
      );
    });
    await new Promise<void>((resolve, reject) => {
      ee.initialize(null, null, resolve, reject, null, projectId);
    });
    return ee;
  })().catch((error: unknown) => {
    initialization = null;
    throw error;
  });

  return initialization;
}

function computeValue(dictionary: EarthEngineDictionary): Promise<unknown> {
  return new Promise((resolve, reject) => {
    dictionary.evaluate((value, error) => {
      if (error) reject(new Error(error));
      else resolve(value);
    });
  });
}

function maskAndCalculateIndices(source: LandsatStatsSource) {
  return (image: EarthEngineImage): EarthEngineImage => {
    const qa = image.select("QA_PIXEL");
    let clearPixels = qa.bitwiseAnd(1 << 0).eq(0);
    for (const bit of [1, 2, 3, 4, 5]) {
      clearPixels = clearPixels.and(qa.bitwiseAnd(1 << bit).eq(0));
    }

    const reflectance = image
      .select([source.bands.green, source.bands.red, source.bands.nir, source.bands.swir2])
      .multiply(SCALE_FACTOR)
      .add(SCALE_OFFSET);
    const green = reflectance.select(source.bands.green);
    const red = reflectance.select(source.bands.red);
    const nir = reflectance.select(source.bands.nir);
    const swir2 = reflectance.select(source.bands.swir2);
    const ndviDenominator = nir.add(red);
    const ndwiDenominator = green.add(nir);
    const nbrDenominator = nir.add(swir2);

    const ndvi = nir.subtract(red).divide(ndviDenominator).rename("ndvi")
      .updateMask(clearPixels.and(ndviDenominator.neq(0)));
    const ndwi = green.subtract(nir).divide(ndwiDenominator).rename("ndwi")
      .updateMask(clearPixels.and(ndwiDenominator.neq(0)));
    const nbr = nir.subtract(swir2).divide(nbrDenominator).rename("nbr")
      .updateMask(clearPixels.and(nbrDenominator.neq(0)));
    return ndvi.addBands(ndwi).addBands(nbr);
  };
}

export async function fetchLandsatStatistics(
  lat: number,
  lng: number,
  from: Date,
  to: Date,
  source: LandsatStatsSource,
  geometry?: AoiGeometry,
  geometryBounds?: AoiBounds,
): Promise<SpectralStatsResult | null> {
  try {
    const ee = await initializeEarthEngine();

    const west = geometryBounds?.west ?? lng - AOI_HALF_WIDTH_DEGREES;
    const south = geometryBounds?.south ?? lat - AOI_HALF_WIDTH_DEGREES;
    const east = geometryBounds?.east ?? lng + AOI_HALF_WIDTH_DEGREES;
    const north = geometryBounds?.north ?? lat + AOI_HALF_WIDTH_DEGREES;
    const region = geometry
      ? ee.Geometry(geometry)
      : ee.Geometry.Rectangle([west, south, east, north], "EPSG:4326", false);
    const collection = source.collectionIds
      .map((id) => new ee.ImageCollection(id))
      .reduce((combined, next) => combined.merge(next))
      .filterDate(from.toISOString(), to.toISOString())
      .filterBounds(region)
      .map(maskAndCalculateIndices(source));
    const composite = collection.median();
    const centerLatitude = (south + north) / 2;
    const widthMeters = (east - west) * 111_320 * Math.cos(centerLatitude * Math.PI / 180);
    const heightMeters = (north - south) * 111_320;
    const metresPerPixel = Math.max(widthMeters, heightMeters) / STATISTICS_GRID_SIZE;
    const reducerOptions = {
      geometry: region,
      scale: metresPerPixel,
      crs: "EPSG:3857",
      maxPixels: 100_000_000,
      tileScale: 2,
    };
    const reduceBand = (band: string, reducer: unknown) => composite
      .select(band)
      .reduceRegion({ ...reducerOptions, reducer })
      .get(band);
    const totalCount = ee.Image.constant(1).rename("coverage")
      .reduceRegion({ ...reducerOptions, reducer: ee.Reducer.count() })
      .get("coverage");

    const result = await computeValue(new ee.Dictionary({
      ndviMean: reduceBand("ndvi", ee.Reducer.mean()),
      ndviMin: reduceBand("ndvi", ee.Reducer.min()),
      ndviMax: reduceBand("ndvi", ee.Reducer.max()),
      ndwiMean: reduceBand("ndwi", ee.Reducer.mean()),
      ndwiMin: reduceBand("ndwi", ee.Reducer.min()),
      ndwiMax: reduceBand("ndwi", ee.Reducer.max()),
      nbrMean: reduceBand("nbr", ee.Reducer.mean()),
      nbrMin: reduceBand("nbr", ee.Reducer.min()),
      nbrMax: reduceBand("nbr", ee.Reducer.max()),
      validCount: reduceBand("ndvi", ee.Reducer.count()),
      totalCount,
    }));

    return parseLandsatStatistics(result);
  } catch (error) {
    console.error("Earth Engine Landsat statistics failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
