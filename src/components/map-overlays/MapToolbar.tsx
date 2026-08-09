import { MousePointer2, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMapContext } from "@/contexts/MapContext";
import { useRightPanel } from "@/contexts/RightPanelContext";
import MapLayerControls from "@/components/MapLayerControls";

export function MapToolbar() {
  const mapCtx = useMapContext();
  const rightPanel = useRightPanel();

  const geoWitnessActive = rightPanel.mode?.type === "geowitness";

  return (
    <div className="absolute left-3 top-3 z-10 flex items-start gap-1.5">
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => {
            mapCtx.setSelectionMode(false);
            rightPanel.close();
          }}
          title="Default (pan/zoom)"
          className={cn(
            "glass w-9 h-9 flex items-center justify-center rounded-md border",
            "transition-all duration-fast",
            !geoWitnessActive
              ? "border-brand-border text-brand"
              : "border-border-default text-v2-secondary hover:text-v2-primary hover:border-border-strong"
          )}
        >
          <MousePointer2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            rightPanel.open({ type: "geowitness" });
            mapCtx.setSelectionMode(true);
          }}
          title="GeoWitness - select a region on the map"
          className={cn(
            "glass w-9 h-9 flex items-center justify-center rounded-md border",
            "transition-all duration-fast",
            geoWitnessActive
              ? "border-brand-border text-brand"
              : "border-border-default text-v2-secondary hover:text-v2-primary hover:border-border-strong"
          )}
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      <MapLayerControls
        is3DEnabled={mapCtx.is3DEnabled}
        onToggle3D={mapCtx.setIs3DEnabled}
        activeHeatmapLayer={mapCtx.activeHeatmapLayer}
        onHeatmapLayerChange={mapCtx.setActiveHeatmapLayer}
      />
    </div>
  );
}
