import type { Geometry } from "geojson";
import type { ImportedGeoJSON } from "@/types/importedGeoJSON";

/**
 * GIS Export Utilities
 * Convert analysis data to GeoJSON and KML formats for use in QGIS and other GIS software
 */

export interface AnalysisFeature {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number };
  eventType: string;
  changePercent?: number;
  startDate: string;
  endDate: string;
  summary?: string;
  areaAnalyzed?: string;
  createdAt: string;
}

export interface GeoJSONFeature {
  type: "Feature";
  properties: Record<string, any>;
  geometry: {
    type: "Point" | "Polygon";
    coordinates: number[] | number[][][];
  };
}

export interface GeoJSONCollection {
  type: "FeatureCollection";
  name: string;
  features: GeoJSONFeature[];
}

/**
 * Generate a bounding polygon around a point location
 */
function generateBoundingPolygon(
  lng: number,
  lat: number,
  size: number = 0.15
): number[][] {
  return [
    [lng - size, lat + size],
    [lng + size, lat + size],
    [lng + size, lat - size],
    [lng - size, lat - size],
    [lng - size, lat + size], // Close the polygon
  ];
}

/**
 * Convert analysis results to GeoJSON format
 */
export function toGeoJSON(
  features: AnalysisFeature[],
  collectionName: string = "GeoPulse Analysis Export",
  includePolygons: boolean = true
): GeoJSONCollection {
  const geoJSONFeatures: GeoJSONFeature[] = [];

  features.forEach((feature) => {
    const { lat, lng } = feature.coordinates;

    // Add point feature
    geoJSONFeatures.push({
      type: "Feature",
      properties: {
        id: feature.id,
        name: feature.name,
        event_type: feature.eventType,
        change_percent: feature.changePercent || 0,
        start_date: feature.startDate,
        end_date: feature.endDate,
        summary: feature.summary || "",
        area_analyzed: feature.areaAnalyzed || "",
        created_at: feature.createdAt,
        geometry_type: "point",
      },
      geometry: {
        type: "Point",
        coordinates: [lng, lat], // GeoJSON uses [lng, lat]
      },
    });

    // Add polygon feature if requested
    if (includePolygons) {
      geoJSONFeatures.push({
        type: "Feature",
        properties: {
          id: `${feature.id}_boundary`,
          name: `${feature.name} - Analysis Area`,
          event_type: feature.eventType,
          change_percent: feature.changePercent || 0,
          start_date: feature.startDate,
          end_date: feature.endDate,
          geometry_type: "polygon",
        },
        geometry: {
          type: "Polygon",
          coordinates: [generateBoundingPolygon(lng, lat)],
        },
      });
    }
  });

  return {
    type: "FeatureCollection",
    name: collectionName,
    features: geoJSONFeatures,
  };
}

function coordinatesToKML(coordinates: number[][]): string {
  return coordinates.map(position => position.join(",")).join(" ");
}

function geometryToKML(geometry: Geometry): string {
  switch (geometry.type) {
    case "Point":
      return `<Point><coordinates>${geometry.coordinates.join(",")}</coordinates></Point>`;
    case "MultiPoint":
      return `<MultiGeometry>${geometry.coordinates.map(position =>
        `<Point><coordinates>${position.join(",")}</coordinates></Point>`
      ).join("")}</MultiGeometry>`;
    case "LineString":
      return `<LineString><coordinates>${coordinatesToKML(geometry.coordinates)}</coordinates></LineString>`;
    case "MultiLineString":
      return `<MultiGeometry>${geometry.coordinates.map(coordinates =>
        `<LineString><coordinates>${coordinatesToKML(coordinates)}</coordinates></LineString>`
      ).join("")}</MultiGeometry>`;
    case "Polygon":
      return `<Polygon>${geometry.coordinates.map((ring, index) =>
        `<${index === 0 ? "outer" : "inner"}BoundaryIs><LinearRing><coordinates>${coordinatesToKML(ring)}</coordinates></LinearRing></${index === 0 ? "outer" : "inner"}BoundaryIs>`
      ).join("")}</Polygon>`;
    case "MultiPolygon":
      return `<MultiGeometry>${geometry.coordinates.map(coordinates =>
        geometryToKML({ type: "Polygon", coordinates })
      ).join("")}</MultiGeometry>`;
    case "GeometryCollection":
      return `<MultiGeometry>${geometry.geometries.map(geometryToKML).join("")}</MultiGeometry>`;
  }
}

function toKMLFromGeoJSON(collection: ImportedGeoJSON, documentName: string): string {
  const placemarks = collection.features.flatMap((feature, index) => {
    if (!feature.geometry) return [];
    const properties = feature.properties ?? {};
    const name = String(properties.name ?? properties.NAME ?? `Feature ${index + 1}`);
    const data = Object.entries(properties)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `<Data name="${escapeXML(key)}"><value>${escapeXML(String(value))}</value></Data>`)
      .join("");
    return [`<Placemark><name>${escapeXML(name)}</name><ExtendedData>${data}</ExtendedData>${geometryToKML(feature.geometry)}</Placemark>`];
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escapeXML(documentName)}</name>${placemarks}</Document></kml>`;
}

function geometryToWKT(geometry: Geometry): string {
  const pointList = (positions: number[][]) => positions.map(position => position.join(" ")).join(", ");
  switch (geometry.type) {
    case "Point":
      return `POINT (${geometry.coordinates.join(" ")})`;
    case "MultiPoint":
      return `MULTIPOINT (${pointList(geometry.coordinates)})`;
    case "LineString":
      return `LINESTRING (${pointList(geometry.coordinates)})`;
    case "MultiLineString":
      return `MULTILINESTRING (${geometry.coordinates.map(line => `(${pointList(line)})`).join(", ")})`;
    case "Polygon":
      return `POLYGON (${geometry.coordinates.map(ring => `(${pointList(ring)})`).join(", ")})`;
    case "MultiPolygon":
      return `MULTIPOLYGON (${geometry.coordinates.map(polygon =>
        `(${polygon.map(ring => `(${pointList(ring)})`).join(", ")})`
      ).join(", ")})`;
    case "GeometryCollection":
      return `GEOMETRYCOLLECTION (${geometry.geometries.map(geometryToWKT).join(", ")})`;
  }
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportAsCSV(
  features: AnalysisFeature[],
  filename = "geopulse-export",
  importedGeoJSON?: ImportedGeoJSON
): void {
  const rows = importedGeoJSON
    ? importedGeoJSON.features.flatMap((feature, index) => feature.geometry ? [{
      id: String(feature.id ?? feature.properties?.id ?? index + 1),
      name: String(feature.properties?.name ?? feature.properties?.NAME ?? `Feature ${index + 1}`),
      eventType: String(feature.properties?.event_type ?? feature.properties?.type ?? ""),
      changePercent: feature.properties?.change_percent ?? "",
      startDate: String(feature.properties?.start_date ?? ""),
      endDate: String(feature.properties?.end_date ?? ""),
      longitude: "",
      latitude: "",
      wkt: geometryToWKT(feature.geometry),
      properties: JSON.stringify(feature.properties ?? {}),
    }] : [])
    : features.map(feature => ({
      id: feature.id,
      name: feature.name,
      eventType: feature.eventType,
      changePercent: feature.changePercent ?? "",
      startDate: feature.startDate,
      endDate: feature.endDate,
      longitude: feature.coordinates.lng,
      latitude: feature.coordinates.lat,
      wkt: `POINT (${feature.coordinates.lng} ${feature.coordinates.lat})`,
      properties: "",
    }));
  const headers = ["id", "name", "event_type", "change_percent", "start_date", "end_date", "longitude", "latitude", "wkt", "properties"];
  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map(row => [
      row.id, row.name, row.eventType, row.changePercent, row.startDate,
      row.endDate, row.longitude, row.latitude, row.wkt, row.properties,
    ].map(csvCell).join(",")),
  ].join("\r\n");
  downloadFile(csv, `${filename}.csv`, "text/csv;charset=utf-8");
}

/**
 * Convert analysis results to KML format
 */
export function toKML(
  features: AnalysisFeature[],
  documentName: string = "GeoPulse Analysis Export"
): string {
  const placemarks = features
    .map((feature) => {
      const { lat, lng } = feature.coordinates;
      const changePercent = feature.changePercent || 0;
      
      // Color based on change severity (KML uses AABBGGRR format)
      const color = changePercent > 50 
        ? "ff0000ff" // Red
        : changePercent > 25 
        ? "ff00a5ff" // Orange
        : "ff00ff00"; // Green

      const polygonCoords = generateBoundingPolygon(lng, lat)
        .map((coord) => `${coord[0]},${coord[1]},0`)
        .join(" ");

      return `
    <Placemark>
      <name>${escapeXML(feature.name)}</name>
      <description><![CDATA[
        <h3>${escapeXML(feature.eventType.replace(/_/g, " ").toUpperCase())}</h3>
        <p><strong>Change Detected:</strong> ${changePercent}%</p>
        <p><strong>Analysis Period:</strong> ${feature.startDate} to ${feature.endDate}</p>
        <p><strong>Coordinates:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
        ${feature.summary ? `<p><strong>Summary:</strong> ${escapeXML(feature.summary)}</p>` : ""}
        ${feature.areaAnalyzed ? `<p><strong>Area:</strong> ${escapeXML(feature.areaAnalyzed)}</p>` : ""}
        <p><strong>Created:</strong> ${new Date(feature.createdAt).toLocaleDateString()}</p>
      ]]></description>
      <ExtendedData>
        <Data name="event_type"><value>${feature.eventType}</value></Data>
        <Data name="change_percent"><value>${changePercent}</value></Data>
        <Data name="start_date"><value>${feature.startDate}</value></Data>
        <Data name="end_date"><value>${feature.endDate}</value></Data>
      </ExtendedData>
      <Style>
        <IconStyle>
          <color>${color}</color>
          <scale>1.2</scale>
          <Icon>
            <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
          </Icon>
        </IconStyle>
        <PolyStyle>
          <color>4d${color.slice(2)}</color>
          <outline>1</outline>
        </PolyStyle>
        <LineStyle>
          <color>${color}</color>
          <width>2</width>
        </LineStyle>
      </Style>
      <MultiGeometry>
        <Point>
          <coordinates>${lng},${lat},0</coordinates>
        </Point>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${polygonCoords}</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </MultiGeometry>
    </Placemark>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXML(documentName)}</name>
    <description>Exported from GeoPulse - Environmental Monitoring Platform</description>
    <Style id="analysisStyle">
      <IconStyle>
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
    ${placemarks}
  </Document>
</kml>`;
}

/**
 * Escape special XML characters
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Download a file with the given content
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export analysis data as GeoJSON file
 */
export function exportAsGeoJSON(
  features: AnalysisFeature[],
  filename: string = "geopulse-export",
  importedGeoJSON?: ImportedGeoJSON
): void {
  const geoJSON = importedGeoJSON ?? toGeoJSON(features);
  downloadFile(
    JSON.stringify(geoJSON, null, 2),
    `${filename}.geojson`,
    "application/geo+json"
  );
}

/**
 * Export analysis data as KML file
 */
export function exportAsKML(
  features: AnalysisFeature[],
  filename: string = "geopulse-export",
  importedGeoJSON?: ImportedGeoJSON
): void {
  const kml = importedGeoJSON
    ? toKMLFromGeoJSON(importedGeoJSON, filename)
    : toKML(features);
  downloadFile(kml, `${filename}.kml`, "application/vnd.google-earth.kml+xml");
}

/**
 * Export analysis data as a real ESRI Shapefile bundle (.shp/.shx/.dbf/.prj) inside a .zip.
 * Compatible with ArcGIS, QGIS, MapInfo, GDAL/OGR and other traditional GIS tools.
 * Points and polygons are written into separate shapefile layers within the same archive,
 * which is required by the shapefile spec (one geometry type per file).
 */
export async function exportAsShapefileZip(
  features: AnalysisFeature[],
  filename: string = "geopulse-export",
  importedGeoJSON?: ImportedGeoJSON
): Promise<void> {
  // Dynamic import keeps initial bundle slim
  const shpwrite = (await import("@mapbox/shp-write")).default || (await import("@mapbox/shp-write"));
  const geoJSON = importedGeoJSON ?? toGeoJSON(features);

  // WGS84 / EPSG:4326 — standard projection for the bundled .prj
  const prj =
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

  // shp-write expects DBF field names <= 10 chars (ESRI restriction). The properties
  // in toGeoJSON are already short and ASCII-safe, so they survive the round-trip.
  (shpwrite as any).download(
    geoJSON,
    {
      folder: filename,
      filename,
      outputType: "blob",
      compression: "DEFLATE",
      prj,
      types: {
        point: "points",
        polygon: "polygons",
        line: "lines",
      },
    }
  );
}

/**
 * Convert database analysis result to AnalysisFeature format
 */
export function dbResultToFeature(result: any): AnalysisFeature | null {
  // Handle coordinates in various formats
  let coords = result.coordinates;
  if (typeof coords === "string") {
    try {
      coords = JSON.parse(coords);
    } catch {
      return null;
    }
  }

  if (!coords || (typeof coords.lat !== "number" && typeof coords.latitude !== "number")) {
    return null;
  }

  return {
    id: result.id,
    name: result.region || result.location_name || "Unknown Location",
    coordinates: {
      lat: coords.lat || coords.latitude,
      lng: coords.lng || coords.longitude || coords.lon,
    },
    eventType: result.event_type,
    changePercent: result.change_percent,
    startDate: result.start_date,
    endDate: result.end_date,
    summary: result.summary,
    areaAnalyzed: result.area_analyzed,
    createdAt: result.created_at,
  };
}
