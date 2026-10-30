import { useState } from "react";
import { Crosshair, Download, Loader2, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMapContext } from "@/contexts/MapContext";
import { useRightPanel } from "@/contexts/RightPanelContext";
import MapLayerControls from "@/components/MapLayerControls";
import { exportMapAsGeoTIFF } from "@/lib/geotiff-export";
import { toast } from "sonner";

export function MapToolbar() {
  const mapCtx = useMapContext();
  const rightPanel = useRightPanel();
  const [exporting, setExporting] = useState(false);

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
      <button
        type="button"
        disabled={!mapCtx.mapReady || exporting}
        onClick={async () => {
          setExporting(true);
          try {
            const frame = await mapCtx.captureGeoTIFFFrame();
            if (!frame) throw new Error("The map is not ready to export");
            await exportMapAsGeoTIFF(frame.image, frame.bounds);
            toast.success("Map exported as GeoTIFF (.tif)");
          } catch (error) {
            console.error("GeoTIFF export error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to export map");
          } finally {
            setExporting(false);
          }
        }}
        title="Export current map view as GeoTIFF"
        aria-label="Export current map view as GeoTIFF"
        className={cn(
          "glass flex h-9 items-center gap-2 rounded-md border px-3 text-xs",
          "border-border-default text-v2-secondary hover:border-border-strong hover:text-v2-primary",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        GeoTIFF
      </button>
    </div>
  );
}
