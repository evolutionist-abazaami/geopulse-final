import { useEffect, useRef } from "react";
import MapLibreMap, { type MapLibreMapHandle } from "@/components/MapLibreMap";
import { useMapContext } from "@/contexts/MapContext";
import { MapToolbar } from "@/components/map-overlays/MapToolbar";
import { AlertMarkers } from "@/components/map-overlays/AlertMarkers";
import { MonitoredRegionMarkers } from "@/components/map-overlays/MonitoredRegionMarkers";
import { MapLegend } from "@/components/map-overlays/MapLegend";

export default function MapView() {
  const mapCtx = useMapContext();
  const handleRef = useRef<MapLibreMapHandle>(null);

  useEffect(() => {
    mapCtx.registerMapHandle(handleRef.current);
    return () => mapCtx.registerMapHandle(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full h-full">
      <div className="absolute inset-0">
        <MapLibreMap
          ref={handleRef}
          onMapReady={mapCtx.registerMap}
          center={mapCtx.center}
          zoom={mapCtx.zoom}
          className="h-full w-full"
          markers={mapCtx.markers}
          polygons={mapCtx.polygons}
          selectionMode={mapCtx.selectionMode}
          onLocationSelect={mapCtx.onLocationSelect}
          selectedArea={mapCtx.selectedArea}
          is3DEnabled={mapCtx.is3DEnabled}
          activeHeatmapLayer={mapCtx.activeHeatmapLayer}
          showFullscreenControl
          showGeolocateControl
        />
      </div>

      <MapToolbar />
      <AlertMarkers />
      <MonitoredRegionMarkers />
      <MapLegend />
    </div>
  );
}
