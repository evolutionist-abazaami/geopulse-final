import { fromArrayBuffer } from "geotiff";
import { parse as parseWKT } from "wellknown";
import proj4 from "proj4";
import type { Feature, Geometry, Position } from "geojson";
import type { ImportedGeoJSON, ImportedRasterOverlay } from "@/types/importedGeoJSON";
import type { AnalysisFeature } from "@/lib/gis-export";
import type { ShapefileImportResult } from "@/lib/shapefile-utils";

type ImportBounds = ShapefileImportResult["bounds"];

function collectPositions(coordinates: unknown, positions: Position[]): void {
  if (!Array.isArray(coordinates)) return;
  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number" &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1])
  ) {
    positions.push(coordinates as Position);
    return;
  }
  coordinates.forEach(coordinate => collectPositions(coordinate, positions));
}

function featureCollectionResult(
  geoJSON: ImportedGeoJSON,
  raster?: ImportedRasterOverlay
): ShapefileImportResult {
  const features: AnalysisFeature[] = [];
  const positions: Position[] = [];
  const properties: Record<string, unknown>[] = [];
  const today = new Date().toISOString().slice(0, 10);

  geoJSON.features.forEach((feature, index) => {
    if (!feature.geometry) return;
    const featurePositions: Position[] = [];
    const visitGeometry = (geometry: Geometry) => {
      if (geometry.type === "GeometryCollection") {
        geometry.geometries.forEach(visitGeometry);
      } else {
        collectPositions(geometry.coordinates, featurePositions);
      }
    };
    visitGeometry(feature.geometry);
    if (featurePositions.length === 0) return;

    featurePositions.forEach(position => positions.push(position));
    const props = feature.properties ?? {};
    properties.push(props);
    const [lng, lat] = featurePositions.reduce<[number, number]>(
      ([sumLng, sumLat], position) => [sumLng + position[0], sumLat + position[1]],
      [0, 0]
    ).map(value => value / featurePositions.length) as [number, number];

    const value = (key: string, ...fallbackKeys: string[]) => {
      for (const candidate of [key, ...fallbackKeys]) {
        const property = props[candidate];
        if (property !== undefined && property !== null && property !== "") return property;
      }
      return undefined;
    };
    const changePercentValue = Number(value("change_percent", "changePercent"));
    features.push({
      id: String(feature.id ?? value("id") ?? `gis_${index}`),
      name: String(value("name", "NAME", "Name") ?? `Feature ${index + 1}`),
      coordinates: { lat, lng },
      eventType: String(value("event_type", "eventType", "type") ?? "environmental_change"),
      changePercent: Number.isFinite(changePercentValue) ? changePercentValue : undefined,
      startDate: String(value("start_date", "startDate") ?? today),
      endDate: String(value("end_date", "endDate") ?? today),
      summary: value("summary", "description") === undefined
        ? undefined
        : String(value("summary", "description")),
      areaAnalyzed: value("area", "area_analyzed") === undefined
        ? undefined
        : String(value("area", "area_analyzed")),
      createdAt: today,
    });
  });

  if (!features.length && !raster) {
    throw new Error("No supported GIS geometries were found in this file");
  }
  if (!positions.length && !raster) {
    throw new Error("No supported GIS geometries were found in this file");
  }

  const bounds: ImportBounds = positions.length
    ? positions.reduce<ImportBounds>((current, [lng, lat]) => ({
      minLat: Math.min(current.minLat, lat),
      maxLat: Math.max(current.maxLat, lat),
      minLng: Math.min(current.minLng, lng),
      maxLng: Math.max(current.maxLng, lng),
    }), { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 })
    : rasterBounds(raster);

  return {
    features,
    properties,
    geoJSON,
    raster,
    bounds,
  };
}

function rasterBounds(raster: ImportedRasterOverlay): ImportBounds {
  const longitudes = raster.coordinates.map(([lng]) => lng);
  const latitudes = raster.coordinates.map(([, lat]) => lat);
  return {
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
    minLng: Math.min(...longitudes),
    maxLng: Math.max(...longitudes),
  };
}

function isGeometry(value: unknown): value is Geometry {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const geometry = value as { type?: string; coordinates?: unknown; geometries?: unknown };
  if (geometry.type === "GeometryCollection") {
    return Array.isArray(geometry.geometries) && geometry.geometries.every(isGeometry);
  }
  return (
    ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(geometry.type ?? "") &&
    Array.isArray(geometry.coordinates)
  );
}

export function parseGeoJSONText(text: string): ShapefileImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON");
  }

  let candidates: unknown[];
  if (
    parsed &&
    typeof parsed === "object" &&
    "type" in parsed &&
    parsed.type === "FeatureCollection" &&
    "features" in parsed &&
    Array.isArray(parsed.features)
  ) {
    candidates = parsed.features;
  } else if (parsed && typeof parsed === "object" && "type" in parsed && parsed.type === "Feature") {
    candidates = [parsed];
  } else if (isGeometry(parsed)) {
    candidates = [{ type: "Feature", properties: {}, geometry: parsed }];
  } else {
    throw new Error("GeoJSON must contain a FeatureCollection, Feature, or Geometry");
  }

  const features = candidates.filter((candidate): candidate is Feature => {
    if (!candidate || typeof candidate !== "object" || !("type" in candidate) || candidate.type !== "Feature") return false;
    if (!("geometry" in candidate) || candidate.geometry === null) return false;
    return isGeometry(candidate.geometry);
  });
  if (!features.length) throw new Error("The GeoJSON file contains no valid features");
  return featureCollectionResult({ type: "FeatureCollection", features });
}

function localName(element: Element): string {
  return element.localName || element.nodeName.split(":").pop() || "";
}

function findDescendant(element: Element, name: string): Element | undefined {
  return Array.from(element.getElementsByTagName("*")).find(child => localName(child) === name);
}

function parseKMLCoordinates(text: string): Position[] {
  return text.trim().split(/\s+/).filter(Boolean).map((tuple) => {
    const values = tuple.split(",").map(Number);
    return values.length >= 2 && values.slice(0, 2).every(Number.isFinite)
      ? values as Position
      : null;
  }).filter((position): position is Position => position !== null);
}

function kmlGeometries(element: Element): Geometry[] {
  const type = localName(element);
  if (type === "MultiGeometry" || type === "MultiTrack") {
    return Array.from(element.children).flatMap(kmlGeometries);
  }

  if (type === "Point" || type === "LineString" || type === "LinearRing") {
    const coordinates = findDescendant(element, "coordinates");
    const positions = coordinates ? parseKMLCoordinates(coordinates.textContent ?? "") : [];
    if (type === "Point" && positions.length) {
      return [{ type: "Point", coordinates: positions[0] }];
    }
    if (type !== "Point" && positions.length >= 2) {
      return [{ type: "LineString", coordinates: positions }];
    }
    return [];
  }

  if (type === "Polygon") {
    const boundaries = Array.from(element.getElementsByTagName("*"))
      .filter(child => localName(child) === "outerBoundaryIs" || localName(child) === "innerBoundaryIs");
    const rings = boundaries.map(boundary => {
      const coordinates = findDescendant(boundary, "coordinates");
      return coordinates ? parseKMLCoordinates(coordinates.textContent ?? "") : [];
    }).filter(ring => ring.length >= 4);
    return rings.length ? [{ type: "Polygon", coordinates: rings }] : [];
  }

  return [];
}

export function parseKMLText(text: string): ShapefileImportResult {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The KML file has invalid XML");

  const placemarks = Array.from(document.getElementsByTagName("*"))
    .filter(element => localName(element) === "Placemark");
  const features: ImportedGeoJSON["features"] = [];
  placemarks.forEach((placemark, index) => {
    const nameElement = findDescendant(placemark, "name");
    const descriptionElement = findDescendant(placemark, "description");
    const properties: Record<string, unknown> = {
      name: nameElement?.textContent?.trim() || `Placemark ${index + 1}`,
    };
    if (descriptionElement?.textContent) properties.description = descriptionElement.textContent.trim();
    kmlGeometries(placemark).forEach((geometry, geometryIndex) => {
      features.push({
        type: "Feature",
        id: `${index}-${geometryIndex}`,
        properties: { ...properties },
        geometry,
      });
    });
  });

  if (!features.length) throw new Error("The KML file contains no supported placemark geometries");
  return featureCollectionResult({ type: "FeatureCollection", features });
}

function parseDelimitedText(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", "\t", ";"].sort((left, right) =>
    firstLine.split(right).length - firstLine.split(left).length
  )[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index++;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("The CSV file contains an unterminated quoted field");
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function normalizedHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseCSVText(text: string): ShapefileImportResult {
  const [headerRow, ...dataRows] = parseDelimitedText(text.replace(/^\uFEFF/, ""));
  if (!headerRow?.length) throw new Error("The CSV file is empty");
  const headers = headerRow.map(normalizedHeader);
  const findColumn = (...names: string[]) => headers.findIndex(header => names.includes(header));
  const latitudeColumn = findColumn("latitude", "lat", "y", "pointy", "pointlatitude");
  const longitudeColumn = findColumn("longitude", "lon", "lng", "x", "pointx", "pointlongitude");
  const geometryColumn = findColumn("wkt", "geometry", "geom");
  if ((latitudeColumn < 0 || longitudeColumn < 0) && geometryColumn < 0) {
    throw new Error("CSV needs latitude/longitude columns or a WKT geometry column");
  }

  const features: ImportedGeoJSON["features"] = [];
  dataRows.forEach((row, rowIndex) => {
    const properties: Record<string, unknown> = {};
    headerRow.forEach((header, index) => {
      if (header.trim()) properties[header.trim()] = row[index]?.trim() ?? "";
    });

    let geometry: Geometry | null = null;
    const wkt = geometryColumn >= 0 ? row[geometryColumn]?.trim() : "";
    if (wkt) geometry = parseWKT(wkt) as Geometry | null;
    if (!geometry && latitudeColumn >= 0 && longitudeColumn >= 0) {
      const lat = Number(row[latitudeColumn]);
      const lng = Number(row[longitudeColumn]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) geometry = { type: "Point", coordinates: [lng, lat] };
    }
    if (!geometry) return;

    features.push({
      type: "Feature",
      id: rowIndex,
      properties,
      geometry,
    });
  });

  if (!features.length) throw new Error("The CSV has no rows with valid coordinate or WKT geometry values");
  return featureCollectionResult({ type: "FeatureCollection", features });
}

const WEB_MERCATOR_LIMIT = 85.0511287798066;

function getRasterProjection(epsg: number): string {
  if (epsg === 4326 || epsg === 3857 || epsg === 4269) return `EPSG:${epsg}`;
  if ((epsg >= 32601 && epsg <= 32660) || (epsg >= 32701 && epsg <= 32760)) {
    const zone = epsg % 100;
    const south = epsg >= 32700;
    const definition = `+proj=utm +zone=${zone}${south ? " +south" : ""} +datum=WGS84 +units=m +no_defs`;
    proj4.defs(`EPSG:${epsg}`, definition);
    return `EPSG:${epsg}`;
  }
  throw new Error(`This GeoTIFF uses EPSG:${epsg || "unknown"}, which cannot be reprojected in the browser. Convert it to EPSG:4326, EPSG:3857, or WGS84 UTM before importing.`);
}

export async function parseGeoTIFFFile(file: File): Promise<ImportedRasterOverlay> {
  const buffer = await file.arrayBuffer();
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const keys = image.getGeoKeys();
  const epsg = Number(keys?.ProjectedCSTypeGeoKey ?? keys?.GeographicTypeGeoKey ?? 0);
  const projection = proj4(getRasterProjection(epsg), "EPSG:4326");
  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  const transform = (x: number, y: number): [number, number] => {
    const [lng, lat] = projection.forward([x, y]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > WEB_MERCATOR_LIMIT) {
      throw new Error("GeoTIFF extent could not be converted to a valid map extent");
    }
    return [lng, lat];
  };
  const coordinates: ImportedRasterOverlay["coordinates"] = [
    transform(minX, maxY),
    transform(maxX, maxY),
    transform(maxX, minY),
    transform(minX, minY),
  ];

  const scale = Math.min(1, 2048 / width, 2048 / height);
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const pixels = await image.readRGB({ width: outputWidth, height: outputHeight, interleave: true });
  if (pixels.length !== outputWidth * outputHeight * 3) {
    throw new Error("GeoTIFF does not contain a supported RGB or grayscale image");
  }
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create an image canvas for GeoTIFF import");
  const rgba = context.createImageData(outputWidth, outputHeight);
  for (let source = 0, target = 0; source < pixels.length; source += 3, target += 4) {
    rgba.data[target] = pixels[source];
    rgba.data[target + 1] = pixels[source + 1];
    rgba.data[target + 2] = pixels[source + 2];
    rgba.data[target + 3] = 255;
  }
  context.putImageData(rgba, 0, 0);
  return {
    imageDataUrl: canvas.toDataURL("image/png"),
    name: file.name,
    coordinates,
  };
}
