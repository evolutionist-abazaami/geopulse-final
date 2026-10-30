/**
 * Shapefile Import/Export Utilities
 * Support for .shp, .dbf, .shx, .prj files for GIS compatibility
 */

import * as shapefile from 'shapefile';
import proj4 from 'proj4';
import { unzipSync } from 'fflate';
import { AnalysisFeature, toGeoJSON, downloadFile } from './gis-export';
import type { ImportedGeoJSON } from '@/types/importedGeoJSON';
import type { Geometry } from 'geojson';

export interface ShapefileImportResult {
  features: AnalysisFeature[];
  properties: Record<string, unknown>[];
  geoJSON: ImportedGeoJSON;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  crs?: string;
}

export interface ShapefileArchiveContents {
  shpBuffer: ArrayBuffer;
  dbfBuffer?: ArrayBuffer;
  prjText?: string;
}

export function extractShapefileArchive(archiveBuffer: ArrayBuffer): ShapefileArchiveContents {
  const entries = unzipSync(new Uint8Array(archiveBuffer));
  const files = Object.entries(entries)
    .filter(([name]) => !name.endsWith('/'))
    .map(([name, data]) => ({
      name: name.replace(/\\/g, '/'),
      data,
      basename: name.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '',
      directory: name.replace(/\\/g, '/').split('/').slice(0, -1).join('/').toLowerCase(),
    }));
  const shapefiles = files.filter(file => file.basename.endsWith('.shp'));
  if (shapefiles.length !== 1) {
    throw new Error(
      shapefiles.length === 0
        ? 'The ZIP archive does not contain a .shp file'
        : 'The ZIP archive contains multiple .shp files; upload one shapefile per archive'
    );
  }

  const shp = shapefiles[0];
  const stem = shp.basename.slice(0, -4);
  const sidecar = (extension: string) =>
    files.find(file => file.directory === shp.directory && file.basename === `${stem}.${extension}`) ??
    files.find(file => file.basename === `${stem}.${extension}`);
  const toArrayBuffer = (data: Uint8Array): ArrayBuffer => {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
  };
  const dbf = sidecar('dbf');
  const prj = sidecar('prj');

  return {
    shpBuffer: toArrayBuffer(shp.data),
    dbfBuffer: dbf ? toArrayBuffer(dbf.data) : undefined,
    prjText: prj ? new TextDecoder().decode(prj.data).replace(/^\uFEFF/, '') : undefined,
  };
}

/**
 * Parse a shapefile from ArrayBuffer
 */
export async function parseShapefile(
  shpBuffer: ArrayBuffer,
  dbfBuffer?: ArrayBuffer,
  prjText?: string
): Promise<ShapefileImportResult> {
  const features: AnalysisFeature[] = [];
  const properties: Record<string, unknown>[] = [];
  const geoJSONFeatures: ImportedGeoJSON['features'] = [];
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

  try {
    const source = await shapefile.open(shpBuffer, dbfBuffer);
    const projection = prjText?.trim()
      ? proj4(prjText.trim(), 'EPSG:4326')
      : null;
    
    let result = await source.read();
    let index = 0;
    
    while (!result.done) {
      const feature = result.value;
      
      if (feature && feature.geometry) {
        const geometry = projection
          ? {
            ...feature.geometry,
            coordinates: transformCoordinates(feature.geometry.coordinates, (x, y) => {
              const projected = projection.forward([x, y]);
              return [projected[0], projected[1]];
            }),
          } as Geometry
          : feature.geometry;
        const positions: [number, number][] = [];
        collectPositions(geometry.coordinates, positions);
        if (positions.length === 0) {
          result = await source.read();
          index++;
          continue;
        }
        const hasInvalidGeographicCoordinates = positions.some(([lng, lat]) =>
          Math.abs(lng) > 180 || Math.abs(lat) > 90
        );
        if (hasInvalidGeographicCoordinates) {
          throw new Error(
            projection
              ? 'The .prj coordinates could not be converted to WGS84. Check that the matching projection file is included.'
              : 'Coordinates are outside longitude/latitude ranges. Upload the matching .prj file or a ZIP containing the shapefile sidecars.'
          );
        }

        geoJSONFeatures.push({
          type: 'Feature',
          properties: feature.properties || {},
          geometry,
        });
        const lng = positions.reduce((sum, point) => sum + point[0], 0) / positions.length;
        const lat = positions.reduce((sum, point) => sum + point[1], 0) / positions.length;

        // Update bounds
        positions.forEach(([positionLng, positionLat]) => {
          minLat = Math.min(minLat, positionLat);
          maxLat = Math.max(maxLat, positionLat);
          minLng = Math.min(minLng, positionLng);
          maxLng = Math.max(maxLng, positionLng);
        });

        // Extract properties
        const props: Record<string, unknown> = feature.properties || {};
        properties.push(props);

        // Create AnalysisFeature
        features.push({
          id: `shp_${index}_${Date.now()}`,
          name: String(props.name || props.NAME || props.Name || `Feature ${index + 1}`),
          coordinates: { lat, lng },
          eventType: detectEventType(props),
          changePercent: extractChangePercent(props),
          startDate: extractDate(props, 'start') || new Date().toISOString().split('T')[0],
          endDate: extractDate(props, 'end') || new Date().toISOString().split('T')[0],
          summary: String(props.summary || props.SUMMARY || props.description || props.DESCRIPTION || ''),
          areaAnalyzed: extractArea(props),
          createdAt: new Date().toISOString(),
        });
      }

      result = await source.read();
      index++;
    }

    if (features.length === 0) {
      throw new Error('No supported geometries were found in the shapefile');
    }

    return {
      features,
      properties,
      geoJSON: {
        type: 'FeatureCollection',
        features: geoJSONFeatures,
      },
      bounds: { minLat, maxLat, minLng, maxLng },
      crs: 'EPSG:4326',
    };
  } catch (error) {
    console.error('Error parsing shapefile:', error);
    throw new Error(`Failed to parse shapefile: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function transformCoordinates(
  coordinates: unknown,
  transform: (x: number, y: number) => [number, number]
): unknown {
  if (!Array.isArray(coordinates)) return coordinates;
  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number'
  ) {
    const [lng, lat] = transform(coordinates[0], coordinates[1]);
    return [lng, lat, ...coordinates.slice(2)];
  }
  return coordinates.map(coordinate => transformCoordinates(coordinate, transform));
}

function collectPositions(coordinates: unknown, positions: [number, number][]): void {
  if (!Array.isArray(coordinates)) return;
  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number' &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1])
  ) {
    positions.push([coordinates[0], coordinates[1]]);
    return;
  }
  coordinates.forEach((coordinate) => collectPositions(coordinate, positions));
}

/**
 * Detect event type from properties
 */
function detectEventType(props: Record<string, unknown>): string {
  const typeFields = ['event_type', 'eventType', 'EVENT_TYPE', 'type', 'TYPE', 'class', 'CLASS', 'category'];
  
  for (const field of typeFields) {
    if (props[field]) {
      return String(props[field]).toLowerCase().replace(/\s+/g, '_');
    }
  }
  
  // Try to infer from other fields
  const allValues = Object.values(props).map(String).join(' ').toLowerCase();
  if (allValues.includes('deforest') || allValues.includes('forest')) return 'deforestation';
  if (allValues.includes('flood')) return 'flood';
  if (allValues.includes('drought')) return 'drought';
  if (allValues.includes('fire') || allValues.includes('burn')) return 'wildfire';
  if (allValues.includes('urban')) return 'urbanization';
  
  return 'environmental_change';
}

/**
 * Extract change percentage from properties
 */
function extractChangePercent(props: Record<string, unknown>): number | undefined {
  const percentFields = ['change_percent', 'changePercent', 'CHANGE_PERCENT', 'change', 'CHANGE', 'percent', 'PERCENT'];
  
  for (const field of percentFields) {
    if (props[field] !== undefined) {
      const value = parseFloat(String(props[field]));
      if (!isNaN(value)) return value;
    }
  }
  
  return undefined;
}

/**
 * Extract date from properties
 */
function extractDate(props: Record<string, unknown>, type: 'start' | 'end'): string | null {
  const startFields = ['start_date', 'startDate', 'START_DATE', 'date_start', 'begin', 'BEGIN'];
  const endFields = ['end_date', 'endDate', 'END_DATE', 'date_end', 'end', 'END'];
  const dateFields = ['date', 'DATE', 'timestamp', 'TIMESTAMP'];
  
  const fields = type === 'start' ? [...startFields, ...dateFields] : [...endFields, ...dateFields];
  
  for (const field of fields) {
    if (props[field]) {
      const date = new Date(String(props[field]));
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
  }
  
  return null;
}

/**
 * Extract area from properties
 */
function extractArea(props: Record<string, unknown>): string | undefined {
  const areaFields = ['area', 'AREA', 'area_km2', 'AREA_KM2', 'area_analyzed', 'size', 'SIZE'];
  
  for (const field of areaFields) {
    if (props[field] !== undefined) {
      const value = props[field];
      if (typeof value === 'number') {
        return `${value.toFixed(2)} km²`;
      }
      return String(value);
    }
  }
  
  return undefined;
}

/**
 * Read file as ArrayBuffer
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Export GeoJSON as Shapefile (simplified - creates JSON with .shp.json extension)
 * Note: Full shapefile export requires complex binary encoding; this creates a compatible format
 */
export function exportAsShapefile(
  features: AnalysisFeature[],
  filename: string = "geopulse-export"
): void {
  const geoJSON = toGeoJSON(features);
  
  // Create GeoJSON that can be imported by QGIS
  const shapefileJSON = {
    ...geoJSON,
    metadata: {
      generator: "GeoPulse Environmental Intelligence Platform",
      exportDate: new Date().toISOString(),
      featureCount: features.length,
      projection: "EPSG:4326",
      format: "GeoJSON (QGIS/ArcGIS Compatible)"
    }
  };
  
  downloadFile(
    JSON.stringify(shapefileJSON, null, 2),
    `${filename}.geojson`,
    "application/geo+json"
  );
}

/**
 * Generate PRJ file content for WGS84
 */
export function getWGS84PRJ(): string {
  return 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]';
}
