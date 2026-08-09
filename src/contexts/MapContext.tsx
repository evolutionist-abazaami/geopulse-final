import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import maplibregl from "maplibre-gl";
import type { HeatmapLayerType, MapLibreMapHandle } from "@/components/MapLibreMap";

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

  center: [number, number];
  zoom: number;
  setView: (center: [number, number], zoom: number) => void;

  markers: MapMarker[];
  setMarkers: (markers: MapMarker[]) => void;
  polygons: MapPolygon[];
  setPolygons: (polygons: MapPolygon[]) => void;

  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  selectedArea: { lat: number; lng: number; radius?: number } | null;
  setSelectedArea: (v: { lat: number; lng: number; radius?: number } | null) => void;

  onLocationSelect: LocationSelectHandler | undefined;
  setOnLocationSelect: (fn: LocationSelectHandler | undefined) => void;

  is3DEnabled: boolean;
  setIs3DEnabled: (v: boolean) => void;
  activeHeatmapLayer: HeatmapLayerType;
  setActiveHeatmapLayer: (v: HeatmapLayerType) => void;

  flyToBounds: (bounds: RegionBounds, options?: maplibregl.FitBoundsOptions) => void;
  highlightRegion: (bounds: RegionBounds | null) => void;
}

const MapContext = createContext<MapContextValue | null>(null);

const DEFAULT_CENTER: [number, number] = [5.5, 20.0];
const DEFAULT_ZOOM = 4;

const SELECTED_REGION_SOURCE = "selected-region";

export function MapProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapHandleRef = useRef<MapLibreMapHandle | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [polygons, setPolygons] = useState<MapPolygon[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedArea, setSelectedArea] = useState<{ lat: number; lng: number; radius?: number } | null>(null);
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

  const ensureRegionLayers = useCallback((map: maplibregl.Map) => {
    if (map.getSource(SELECTED_REGION_SOURCE)) return;
    map.addSource(SELECTED_REGION_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "selected-region-fill",
      type: "fill",
      source: SELECTED_REGION_SOURCE,
      paint: { "fill-color": "#3b82f6", "fill-opacity": 0.08 },
    });
    map.addLayer({
      id: "selected-region-outline",
      type: "line",
      source: SELECTED_REGION_SOURCE,
      paint: { "line-color": "#3b82f6", "line-width": 1.5, "line-opacity": 0.8, "line-dasharray": [4, 3] },
    });
  }, []);

  const registerMap = useCallback((map: maplibregl.Map) => {
    mapRef.current = map;
    ensureRegionLayers(map);
    setMapReady(true);
  }, [ensureRegionLayers]);

  const registerMapHandle = useCallback((handle: MapLibreMapHandle | null) => {
    mapHandleRef.current = handle;
  }, []);

  const captureSnapshot = useCallback(() => {
    return mapHandleRef.current?.captureSnapshot() ?? Promise.resolve(null);
  }, []);

  const flyToBounds = useCallback((bounds: RegionBounds, options?: maplibregl.FitBoundsOptions) => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(
      [[bounds.west, bounds.south], [bounds.east, bounds.north]],
      { padding: 60, duration: 800, ...options }
    );
  }, []);

  const highlightRegion = useCallback((bounds: RegionBounds | null) => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(SELECTED_REGION_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    if (!bounds) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    source.setData({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [bounds.west, bounds.south],
          [bounds.east, bounds.south],
          [bounds.east, bounds.north],
          [bounds.west, bounds.north],
          [bounds.west, bounds.south],
        ]],
      },
      properties: {},
    });
  }, []);

  const value = useMemo<MapContextValue>(() => ({
    map: mapRef.current,
    mapReady,
    registerMap,
    registerMapHandle,
    captureSnapshot,
    center,
    zoom,
    setView,
    markers,
    setMarkers,
    polygons,
    setPolygons,
    selectionMode,
    setSelectionMode,
    selectedArea,
    setSelectedArea,
    onLocationSelect,
    setOnLocationSelect,
    is3DEnabled,
    setIs3DEnabled,
    activeHeatmapLayer,
    setActiveHeatmapLayer,
    flyToBounds,
    highlightRegion,
  }), [
    mapReady, registerMap, registerMapHandle, captureSnapshot, center, zoom, setView, markers, polygons,
    selectionMode, selectedArea, onLocationSelect, is3DEnabled, activeHeatmapLayer,
    flyToBounds, highlightRegion,
  ]);

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMapContext() {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMapContext must be used within a MapProvider");
  return ctx;
}
