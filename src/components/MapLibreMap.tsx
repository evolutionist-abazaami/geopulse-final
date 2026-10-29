import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BoundaryGeometry } from "@/types/geospatial";
import { MAP_STYLE_URL, TERRAIN_TILE_URL } from "@/utils/mapConfig";
import { reverseLookup } from "@/utils/locationSearch";

export interface MapLibreMapHandle {
  /** Snapshot of exactly what's on screen right now (real OSM tiles + markers/polygons), as a PNG data URL. */
  captureSnapshot: () => Promise<string | null>;
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

export type HeatmapLayerType = "vegetation" | "temperature" | "rainfall" | "none";

// Real NASA GIBS (Global Imagery Browse Services) products, served as
// public, CORS-open XYZ raster tiles - no API key, no proxy. "default" as
// the time segment resolves to the most recent available imagery for each
// product server-side, so this never needs a hardcoded/refreshed date.
// Replaces the old client-generated Math.random() heatmap.
export const GIBS_LAYERS: Record<Exclude<HeatmapLayerType, "none">, { layer: string; tileMatrixSet: string; maxzoom: number; attribution: string }> = {
  vegetation: {
    layer: "MODIS_Terra_NDVI_8Day",
    tileMatrixSet: "GoogleMapsCompatible_Level9",
    maxzoom: 9,
    attribution: "NASA EOSDIS GIBS — MODIS/Terra NDVI, 8-day composite",
  },
  temperature: {
    layer: "MODIS_Terra_Land_Surface_Temp_Day",
    tileMatrixSet: "GoogleMapsCompatible_Level7",
    maxzoom: 7,
    attribution: "NASA EOSDIS GIBS — MODIS/Terra Land Surface Temperature, daily",
  },
  rainfall: {
    layer: "IMERG_Precipitation_Rate",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    maxzoom: 6,
    attribution: "NASA EOSDIS GIBS — GPM IMERG precipitation rate, near real-time",
  },
};

function gibsTileUrl(type: Exclude<HeatmapLayerType, "none">): string {
  const { layer, tileMatrixSet } = GIBS_LAYERS[type];
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/default/${tileMatrixSet}/{z}/{y}/{x}.png`;
}

interface MapLibreMapProps {
  center: [number, number];
  zoom: number;
  className?: string;
  markers?: MapMarker[];
  polygons?: MapPolygon[];
  onLocationSelect?: (location: { lat: number; lng: number; name: string }) => void;
  selectionMode?: boolean;
  selectedArea?: { lat: number; lng: number; radius?: number } | null;
  selectedBoundary?: BoundaryGeometry | null;
  is3DEnabled?: boolean;
  activeHeatmapLayer?: HeatmapLayerType;
  showFullscreenControl?: boolean;
  showGeolocateControl?: boolean;
  onMapReady?: (map: maplibregl.Map) => void;
}

const MapLibreMap = forwardRef<MapLibreMapHandle, MapLibreMapProps>(({
  center,
  zoom,
  className = "",
  markers = [],
  polygons = [],
  onLocationSelect,
  selectionMode = false,
  selectedArea = null,
  selectedBoundary = null,
  is3DEnabled = false,
  activeHeatmapLayer = "none",
  showFullscreenControl = false,
  showGeolocateControl = false,
  onMapReady,
}, ref) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Cache of the last successfully-rendered frame, refreshed whenever the map
  // finishes a render (its 'idle' event). Report snapshots read from this
  // instead of forcing a fresh synchronous capture, since a capture requested
  // right as a repaint job kicks off can otherwise read a blank WebGL buffer -
  // this way we always have a known-good frame regardless of timing.
  const lastSnapshotRef = useRef<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const clickHandlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null);

  // Reverse geocode to get location name
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12_000);
    try {
      return await reverseLookup(lat, lng, controller.signal);
    } catch (error) {
      console.error("Reverse geocode error:", error);
    } finally {
      clearTimeout(timeoutId);
    }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  };

  // Initialize map - without terrain initially to avoid DEM errors
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: MAP_STYLE_URL,
      center: [center[1], center[0]], // MapLibre uses [lng, lat]
      zoom: zoom,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
      interactive: true,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");

    // Add fullscreen control if enabled
    if (showFullscreenControl) {
      map.addControl(new maplibregl.FullscreenControl(), "top-right");
    }

    // Add geolocate control if enabled
    if (showGeolocateControl) {
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
        }),
        "top-right"
      );
    }

    map.on("load", () => {
      console.log("MapLibre map loaded successfully");
      onMapReady?.(map);
      setMapLoaded(true);
    });

    map.on("error", (e) => {
      console.error("MapLibre error:", e);
    });

    map.on("idle", () => {
      try {
        lastSnapshotRef.current = map.getCanvas().toDataURL("image/png");
      } catch (error) {
        console.warn("Error caching map snapshot:", error);
      }
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setMapLoaded(false);
      }
    };
  }, []);

  // Handle 3D mode toggle - add/remove terrain dynamically
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;

    const enable3D = () => {
      try {
        // Add terrain sources if not present
        if (!map.getSource("terrainSource")) {
          map.addSource("terrainSource", {
            type: "raster-dem",
            tiles: [TERRAIN_TILE_URL],
            encoding: "terrarium",
            tileSize: 256,
            maxzoom: 14, // Limit max zoom to avoid DEM range errors
            attribution: "Elevation tiles: AWS Open Data Registry / Terrarium",
          });
        }
        // Add hillshade layer if not present
        if (!map.getLayer("hillshade")) {
          map.addLayer({
            id: "hillshade",
            type: "hillshade",
            source: "terrainSource",
            paint: {
              "hillshade-shadow-color": "#473B24",
              "hillshade-illumination-anchor": "viewport",
              "hillshade-exaggeration": 0.5,
            },
          });
        }
        
        map.setTerrain({ source: "terrainSource", exaggeration: 1.5 });
        
        map.easeTo({
          pitch: 60,
          bearing: -17,
          duration: 1000,
        });
      } catch (error) {
        console.error("Error enabling 3D terrain:", error);
      }
    };

    const disable3D = () => {
      try {
        // Disable terrain first
        map.setTerrain(null);
        
        // Remove hillshade layer
        if (map.getLayer("hillshade")) {
          map.removeLayer("hillshade");
        }
        
        map.easeTo({
          pitch: 0,
          bearing: 0,
          duration: 1000,
        });
      } catch (error) {
        console.error("Error disabling 3D terrain:", error);
      }
    };

    if (is3DEnabled) {
      enable3D();
    } else {
      disable3D();
    }
  }, [is3DEnabled, mapLoaded]);

  // Update center and zoom with DEM-safe handling
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    
    try {
      map.easeTo({
        center: [center[1], center[0]],
        zoom: zoom,
        duration: 500,
      });
    } catch (error) {
      console.warn("Error updating map center:", error);
    }
  }, [center, zoom, is3DEnabled]);

  // Handle selection mode clicks
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove previous handler if exists
    if (clickHandlerRef.current) {
      map.off("click", clickHandlerRef.current);
      clickHandlerRef.current = null;
    }

    if (selectionMode && onLocationSelect) {
      const handleClick = async (e: maplibregl.MapMouseEvent) => {
        const { lng, lat } = e.lngLat;
        const locationName = await reverseGeocode(lat, lng);
        onLocationSelect({ lat, lng, name: locationName });
      };

      clickHandlerRef.current = handleClick;
      map.on("click", handleClick);
      map.getCanvas().style.cursor = "crosshair";
    } else {
      map.getCanvas().style.cursor = "";
    }

    return () => {
      if (clickHandlerRef.current && map) {
        map.off("click", clickHandlerRef.current);
      }
    };
  }, [selectionMode, onLocationSelect]);

  // Update heatmap layer - real NASA GIBS satellite raster tiles, not
  // generated data. See GIBS_LAYERS/gibsTileUrl above.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;

    if (map.getLayer("heatmap-layer")) {
      map.removeLayer("heatmap-layer");
    }
    if (map.getSource("heatmap-source")) {
      map.removeSource("heatmap-source");
    }

    if (activeHeatmapLayer === "none") return;

    const { maxzoom } = GIBS_LAYERS[activeHeatmapLayer];

    map.addSource("heatmap-source", {
      type: "raster",
      tiles: [gibsTileUrl(activeHeatmapLayer)],
      tileSize: 256,
      maxzoom,
      attribution: GIBS_LAYERS[activeHeatmapLayer].attribution,
    });

    map.addLayer({
      id: "heatmap-layer",
      type: "raster",
      source: "heatmap-source",
      paint: {
        "raster-opacity": 0.7,
      },
    });
  }, [activeHeatmapLayer, mapLoaded]);

  // Update markers
  useEffect(() => {
    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const map = mapInstanceRef.current;
    if (!map) return;

    // Add new markers with error handling for DEM issues
    markers.forEach(marker => {
      try {
        const el = document.createElement("div");
        el.className = "custom-marker";
        const dot = document.createElement("div");
        dot.style.cssText = [
          `background:${marker.color || "#0891b2"}`,
          "width:28px",
          "height:28px",
          "border-radius:50%",
          "border:3px solid white",
          "box-shadow:0 4px 12px rgba(0,0,0,0.3)",
          "display:flex",
          "align-items:center",
          "justify-content:center",
        ].join(";");
        const centerDot = document.createElement("span");
        centerDot.style.cssText = "width:8px;height:8px;background:white;border-radius:50%";
        dot.appendChild(centerDot);
        el.appendChild(dot);

        const popupContent = document.createElement("div");
        popupContent.style.padding = "8px";
        const label = document.createElement("strong");
        label.style.fontSize = "14px";
        label.textContent = marker.label;
        const coordinates = document.createElement("p");
        coordinates.style.cssText = "margin:4px 0 0;font-size:12px;color:#666";
        coordinates.textContent = `${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}`;
        popupContent.append(label, coordinates);
        const popup = new maplibregl.Popup({ offset: 25 }).setDOMContent(popupContent);

        const mapMarker = new maplibregl.Marker(el)
          .setLngLat([marker.lng, marker.lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(mapMarker);
      } catch (error) {
        console.warn("Error adding marker:", error);
      }
    });

    // Fit bounds if markers exist - with DEM-safe handling
    if (markers.length > 1 && markers.length < 10) {
      try {
        // Temporarily disable terrain during fitBounds to avoid DEM range errors
        const hadTerrain = !!map.getTerrain();
        if (hadTerrain) {
          map.setTerrain(null);
        }
        
        const bounds = new maplibregl.LngLatBounds();
        markers.forEach(m => bounds.extend([m.lng, m.lat]));
        map.fitBounds(bounds, { padding: 50, maxZoom: 12 });
        
        // Re-enable terrain after fitBounds completes
        if (hadTerrain) {
          setTimeout(() => {
            try {
              if (map.getSource("terrainSource")) {
                map.setTerrain({ source: "terrainSource", exaggeration: 1.5 });
              }
            } catch (e) {
              console.warn("Could not re-enable terrain after fitBounds:", e);
            }
          }, 500);
        }
      } catch (error) {
        console.warn("Error fitting bounds:", error);
      }
    }
  }, [markers]);

  // Update selected area visualization
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;

    try {
      // Remove existing selection layer
      if (map.getLayer("selection-circle")) {
        map.removeLayer("selection-circle");
      }
      if (map.getLayer("selection-outline")) {
        map.removeLayer("selection-outline");
      }
      if (map.getSource("selection-source")) {
        map.removeSource("selection-source");
      }

      if (!selectedArea) return;

      // Create circle geometry
      const radius = (selectedArea.radius || 5000) / 1000; // Convert to km
      const points = 64;
      const coords: [number, number][] = [];
      
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * 2 * Math.PI;
        const dx = radius * Math.cos(angle) / 111; // Approximate degrees
        const dy = radius * Math.sin(angle) / (111 * Math.cos(selectedArea.lat * Math.PI / 180));
        coords.push([selectedArea.lng + dy, selectedArea.lat + dx]);
      }
      coords.push(coords[0]); // Close the circle

      map.addSource("selection-source", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [coords],
          },
        },
      });

      map.addLayer({
        id: "selection-circle",
        type: "fill",
        source: "selection-source",
        paint: {
          "fill-color": "#0891b2",
          "fill-opacity": 0.15,
        },
      });

      map.addLayer({
        id: "selection-outline",
        type: "line",
        source: "selection-source",
        paint: {
          "line-color": "#0891b2",
          "line-width": 2,
        },
      });

      // Add center marker
      const el = document.createElement("div");
      el.innerHTML = `
        <div style="position: relative;">
          <div style="
            position: absolute;
            width: 40px;
            height: 40px;
            background: rgba(8, 145, 178, 0.3);
            border-radius: 50%;
            animation: pulse 1.5s ease-out infinite;
            left: -8px;
            top: -8px;
          "></div>
          <div style="
            width: 24px;
            height: 24px;
            background: linear-gradient(135deg, #0891b2, #0e7490);
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          "></div>
        </div>
      `;

      const selectionMarker = new maplibregl.Marker(el)
        .setLngLat([selectedArea.lng, selectedArea.lat])
        .addTo(map);

      markersRef.current.push(selectionMarker);
    } catch (error) {
      console.warn("Error updating selected area:", error);
    }
  }, [selectedArea, mapLoaded]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;

    const sourceId = "selected-boundary-source";
    const boundaryFeature = selectedBoundary
      ? {
        type: "Feature" as const,
        properties: {},
        geometry: selectedBoundary,
      }
      : null;
    const data = {
      type: "FeatureCollection" as const,
      features: boundaryFeature ? [boundaryFeature] : [],
    };

    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
    } else {
      map.addSource(sourceId, { type: "geojson", data });
      map.addLayer({
        id: "selected-boundary-fill",
        type: "fill",
        source: sourceId,
        paint: { "fill-color": "#0891b2", "fill-opacity": 0.14 },
      });
      map.addLayer({
        id: "selected-boundary-outline",
        type: "line",
        source: sourceId,
        paint: { "line-color": "#0891b2", "line-width": 2.5, "line-opacity": 0.95 },
      });
    }
  }, [selectedBoundary, mapLoaded]);

  // Update polygons
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;

    try {
      const sourceId = "drawn-polygons-source";
      const features = polygons
        .filter((polygon) => polygon.coordinates.length >= 3)
        .map((polygon) => {
          const ring = polygon.coordinates.map(([lng, lat]) => [lng, lat] as [number, number]);
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
          return {
            type: "Feature" as const,
            properties: {
              color: polygon.color || "#0891b2",
              fillOpacity: polygon.fillOpacity ?? 0.3,
              label: polygon.label,
            },
            geometry: { type: "Polygon" as const, coordinates: [ring] },
          };
        });
      const data = { type: "FeatureCollection" as const, features };
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
        return;
      }

      map.addSource(sourceId, { type: "geojson", data });
      map.addLayer({
        id: "drawn-polygons-fill",
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["get", "fillOpacity"],
        },
      });
      map.addLayer({
        id: "drawn-polygons-outline",
        type: "line",
        source: sourceId,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
          "line-dasharray": [2, 1],
        },
      });
    } catch (error) {
      console.error("Error updating polygons:", error);
    }
  }, [polygons, mapLoaded]);

  useImperativeHandle(ref, () => ({
    // Returns the cached last-known-good rendered frame (see the 'idle'
    // listener above) rather than forcing a fresh synchronous read of the
    // WebGL canvas - a forced read timed even slightly wrong (mid-repaint,
    // buffer just cleared, tiles still loading) can silently produce a
    // blank image instead of erroring, which is what a live capture did in
    // practice. If the map isn't currently settled, wait briefly for it to
    // finish loading/panning so the cache has a chance to update first.
    captureSnapshot: () => new Promise<string | null>((resolve) => {
      const map = mapInstanceRef.current;
      if (!map) { resolve(lastSnapshotRef.current); return; }

      const finish = () => resolve(lastSnapshotRef.current);

      if (map.loaded() && !map.isMoving() && !map.isEasing()) {
        finish();
      } else {
        const timeout = setTimeout(() => {
          map.off("idle", onIdle);
          finish();
        }, 8000);
        const onIdle = () => {
          clearTimeout(timeout);
          finish();
        };
        map.once("idle", onIdle);
      }
    }),
  }), []);

  return (
    <div className={`relative ${className}`} style={{ height: "100%", width: "100%" }}>
      <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
      <style>{`
        @keyframes pulse {
          0% {
            transform: scale(1);
            opacity: 0.8;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        .maplibregl-ctrl-group {
          background: hsl(var(--background)) !important;
          border: 1px solid hsl(var(--border)) !important;
        }
        .maplibregl-ctrl-group button {
          background-color: transparent !important;
        }
        .maplibregl-ctrl-group button:hover {
          background-color: hsl(var(--muted)) !important;
        }
        .maplibregl-ctrl-group button span {
          filter: invert(0.5);
        }
        .polygon-label-popup .maplibregl-popup-content {
          background: hsl(var(--card));
          color: hsl(var(--card-foreground));
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          padding: 0;
        }
        .polygon-label-popup .maplibregl-popup-tip {
          border-top-color: hsl(var(--card));
        }
        .maplibregl-popup-content {
          background: hsl(var(--card));
          color: hsl(var(--card-foreground));
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .custom-marker {
          width: 28px;
          height: 28px;
        }
      `}</style>
    </div>
  );
});

MapLibreMap.displayName = "MapLibreMap";

export default MapLibreMap;
