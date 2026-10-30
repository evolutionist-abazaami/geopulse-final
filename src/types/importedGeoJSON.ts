import type { FeatureCollection } from "geojson";

export type ImportedGeoJSON = FeatureCollection;

export interface ImportedRasterOverlay {
  imageDataUrl: string;
  name: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
}
