import { MapPin, Satellite } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRightPanel } from "@/contexts/RightPanelContext";
import type { GeocodedPlace } from "@/types/geospatial";

export function SearchPanel({ data }: { data: GeocodedPlace }) {
  const rightPanel = useRightPanel();

  return (
    <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin p-3.5 space-y-3">
      <div>
        <p className="text-[18px] font-semibold text-gray-900 dark:text-v2-primary leading-snug">{data.name}</p>
        <p className="text-xs text-muted-foreground mt-1">{data.displayName}</p>
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-v2-muted">
        <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <div>
          <p>{data.lat.toFixed(5)}, {data.lng.toFixed(5)} · OpenStreetMap</p>
          <p className="mt-1">
            {data.geometry
              ? "A place boundary is available for area-based analysis."
              : "No boundary was returned. Analysis will use a point-based area, not the full named region."}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-3">
        <p className="text-sm font-medium">Place lookup only</p>
        <p className="text-xs text-muted-foreground mt-1">
          No environmental measurements or findings have been generated for this location yet.
        </p>
      </div>

      <Button
        className="w-full"
        onClick={() => rightPanel.open({ type: "geowitness", initialLocation: data })}
      >
        <Satellite className="w-4 h-4 mr-2" />
        Analyze with GeoWitness
      </Button>
    </div>
  );
}
