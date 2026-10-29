export type Position = [number, number];

export type BoundaryGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export type GeocodeBounds = [[number, number], [number, number]];

export interface GeocodedPlace {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  type: string;
  bounds?: GeocodeBounds;
  geometry?: BoundaryGeometry;
  source: "nominatim";
}
