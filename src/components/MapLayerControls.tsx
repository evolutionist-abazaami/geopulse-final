import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Layers, Mountain, Thermometer, CloudRain, TreePine, Satellite, X } from "lucide-react";
import { HeatmapLayerType, GIBS_LAYERS } from "./MapLibreMap";

interface MapLayerControlsProps {
  is3DEnabled: boolean;
  onToggle3D: (enabled: boolean) => void;
  activeHeatmapLayer: HeatmapLayerType;
  onHeatmapLayerChange: (layer: HeatmapLayerType) => void;
}

const MapLayerControls = ({
  is3DEnabled,
  onToggle3D,
  activeHeatmapLayer,
  onHeatmapLayerChange,
}: MapLayerControlsProps) => {
  const heatmapLayers = [
    { value: "vegetation" as const, label: "Vegetation Density", icon: TreePine, color: "text-green-500" },
    { value: "temperature" as const, label: "Temperature", icon: Thermometer, color: "text-red-500" },
    { value: "rainfall" as const, label: "Rainfall", icon: CloudRain, color: "text-blue-500" },
    { value: "none" as const, label: "No Heatmap", icon: X, color: "text-muted-foreground" },
  ];

  const activeLayer = heatmapLayers.find(l => l.value === activeHeatmapLayer);

  return (
    <Card className="p-1.5 sm:p-2 bg-background/95 backdrop-blur-sm border-border/50 shadow-lg">
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* 3D Toggle */}
        <Button
          variant={is3DEnabled ? "default" : "outline"}
          size="sm"
          onClick={() => onToggle3D(!is3DEnabled)}
          className="gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3"
        >
          <Mountain className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden xs:inline">3D</span>
          <span className="hidden sm:inline"> Terrain</span>
        </Button>

        {/* Heatmap Layer Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
              <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">{activeLayer?.label || "Layers"}</span>
              <span className="sm:hidden">Layers</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {heatmapLayers.map(layer => {
              const Icon = layer.icon;
              return (
                <DropdownMenuItem
                  key={layer.value}
                  onClick={() => onHeatmapLayerChange(layer.value)}
                  className={`gap-2 ${activeHeatmapLayer === layer.value ? "bg-accent" : ""}`}
                >
                  <Icon className={`h-4 w-4 ${layer.color}`} />
                  {layer.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Source attribution for the active layer - real satellite imagery,
          so its own baked-in color scale is shown rather than a guessed one */}
      {activeHeatmapLayer !== "none" && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <div className="flex items-start gap-1.5">
            <Satellite className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-snug">{GIBS_LAYERS[activeHeatmapLayer].attribution}</p>
          </div>
        </div>
      )}
    </Card>
  );
};

export default MapLayerControls;
