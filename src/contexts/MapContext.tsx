import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import type { HeatmapLayerType, MapLibreMapHandle } from "@/components/MapLibreMap";
import type { BoundaryGeometry } from "@/types/geospatial";
import type { ImportedGeoJSON, ImportedRasterOverlay } from "@/types/importedGeoJSON";

export interface RegionBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  color?: string;
}

interface MapPolygon {
  coordinates: [number, number][];
  label: string;
  color?: string;
  fillOpacity?: number;
}

type LocationSelectHandler = (location: { lat: number; lng: number; name: string }) => void;

interface MapContextValue {
  map: maplibregl.Map | null;
  mapReady: boolean;
  registerMap: (map: maplibregl.Map) => void;
  registerMapHandle: (handle: MapLibreMapHandle | null) => void;
  captureSnapshot: () => Promise<string | null>;
  captureGeoTIFFFrame: () => ReturnType<MapLibreMapHandle["captureGeoTIFFFrame"]>;

  center: [number, number];
  zoom: number;
  setView: (center: [number, number], zoom: number) => void;

  markers: MapMarker[];
  setMarkers: (markers: MapMarker[]) => void;
  polygons: MapPolygon[];
  setPolygons: (polygons: MapPolygon[]) => void;
  importedGeoJSON: ImportedGeoJSON | null;
  setImportedGeoJSON: (geoJSON: ImportedGeoJSON | null) => void;
  importedRaster: ImportedRasterOverlay | null;
  setImportedRaster: (raster: ImportedRasterOverlay | null) => void;

  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  selectedArea: { lat: number; lng: number; radius?: number } | null;
  setSelectedArea: (v: { lat: number; lng: number; radius?: number } | null) => void;
  selectedBoundary: BoundaryGeometry | null;
  setSelectedBoundary: (geometry: BoundaryGeometry | null) => void;

  onLocationSelect: LocationSelectHandler | undefined;
  setOnLocationSelect: (fn: LocationSelectHandler | undefined) => void;

  is3DEnabled: boolean;
  setIs3DEnabled: (v: boolean) => void;
  activeHeatmapLayer: HeatmapLayerType;
  setActiveHeatmapLayer: (v: HeatmapLayerType) => void;

  flyToBounds: (bounds: RegionBounds, options?: maplibregl.FitBoundsOptions) => void;
}

const MapContext = createContext<MapContextValue | null>(null);

const DEFAULT_CENTER: [number, number] = [5.5, 20.0];
const DEFAULT_ZOOM = 4;

export function MapProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapHandleRef = useRef<MapLibreMapHandle | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [polygons, setPolygons] = useState<MapPolygon[]>([]);
  const [importedGeoJSON, setImportedGeoJSON] = useState<ImportedGeoJSON | null>(null);
  const [importedRaster, setImportedRaster] = useState<ImportedRasterOverlay | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedArea, setSelectedArea] = useState<{ lat: number; lng: number; radius?: number } | null>(null);
  const [selectedBoundary, setSelectedBoundary] = useState<BoundaryGeometry | null>(null);
  const [onLocationSelect, setOnLocationSelectState] = useState<LocationSelectHandler | undefined>(undefined);
  const [is3DEnabled, setIs3DEnabled] = useState(false);
  const [activeHeatmapLayer, setActiveHeatmapLayer] = useState<HeatmapLayerType>("none");

  const setView = useCallback((nextCenter: [number, number], nextZoom: number) => {
    setCenter(nextCenter);
    setZoom(nextZoom);
  }, []);

  // Storing a function in useState needs the functional-updater form
  // (setState(() => fn)), otherwise React treats a plain function argument
  // as an updater and immediately calls it with the *previous* state -
  // wrapped here once so every caller can just pass the handler directly.
  const setOnLocationSelect = useCallback((fn: LocationSelectHandler | undefined) => {
    setOnLocationSelectState(() => fn);
  }, []);

  const registerMap = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  const registerMapHandle = useCallback((handle: MapLibreMapHandle | null) => {
    mapHandleRef.current = handle;
  }, []);

  const captureSnapshot = useCallback(() => {
    return mapHandleRef.current?.captureSnapshot() ?? Promise.resolve(null);
  }, []);

  const captureGeoTIFFFrame = useCallback(() => {
    return mapHandleRef.current?.captureGeoTIFFFrame() ?? Promise.resolve(null);
  }, []);

  const flyToBounds = useCallback((bounds: RegionBounds, options?: maplibregl.FitBoundsOptions) => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(
      [[bounds.west, bounds.south], [bounds.east, bounds.north]],
      { padding: 60, duration: 800, ...options }
    );
    map.once("moveend", () => {
      const currentCenter = map.getCenter();
      setCenter([currentCenter.lat, currentCenter.lng]);
      setZoom(map.getZoom());
    });
  }, []);

  const value = useMemo<MapContextValue>(() => ({
    map: mapRef.current,
    mapReady,
    registerMap,
    registerMapHandle,
    captureSnapshot,
    captureGeoTIFFFrame,
    center,
    zoom,
    setView,
    markers,
    setMarkers,
    polygons,
    setPolygons,
    importedGeoJSON,
    setImportedGeoJSON,
    importedRaster,
    setImportedRaster,
    selectionMode,
    setSelectionMode,
    selectedArea,
    setSelectedArea,
    selectedBoundary,
    setSelectedBoundary,
    onLocationSelect,
    setOnLocationSelect,
    is3DEnabled,
    setIs3DEnabled,
    activeHeatmapLayer,
    setActiveHeatmapLayer,
    flyToBounds,
  }), [
    mapReady, registerMap, registerMapHandle, captureSnapshot, captureGeoTIFFFrame, center, zoom, setView, markers, polygons, importedGeoJSON, importedRaster,
    selectionMode, selectedArea, selectedBoundary, onLocationSelect, setOnLocationSelect, is3DEnabled,
    activeHeatmapLayer, flyToBounds,
  ]);

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMapContext() {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMapContext must be used within a MapProvider");
  return ctx;
}
