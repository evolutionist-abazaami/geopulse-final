import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Leaf, Droplets, Flame, Info, ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SpectralIndex {
  min: number;
  max: number;
  mean: number;
  std?: number;
}

interface SpectralIndicesDisplayProps {
  spectralIndices?: {
    ndvi?: SpectralIndex;
    ndwi?: SpectralIndex;
    nbr?: SpectralIndex;
  } | null;
  sensorInfo?: {
    sensor?: string;
    statistics_grid?: string;
    metres_per_cell?: { x: number; y: number } | null;
    native_band_resolutions_m?: Record<string, number>;
  } | null;
  landsatInfo?: {
    sensor?: string;
    tile_id?: string;
    acquisition_dates?: string[];
    spatial_resolution?: string;
    bands_used?: string[];
    processing_level?: string;
  } | null;
}

// Numeric thresholds alongside the display copy, so a mean value can pick
// which plain-language reading actually applies to it.
const indexConfig = {
  ndvi: {
    label: 'NDVI',
    fullName: 'Normalized Difference Vegetation Index',
    icon: Leaf,
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    formula: '(NIR - Red) / (NIR + Red)',
    bands: [
      { upTo: 0.2, meaning: 'Bare soil, water, or very sparse vegetation', tone: 'low' as const },
      { upTo: 0.5, meaning: 'Moderate vegetation - crops, shrubs, mixed cover', tone: 'mid' as const },
      { upTo: Infinity, meaning: 'Dense, healthy vegetation', tone: 'high' as const },
    ],
    gradientColors: ['bg-amber-800', 'bg-yellow-500', 'bg-lime-400', 'bg-green-500', 'bg-green-700'],
  },
  ndwi: {
    label: 'NDWI',
    fullName: 'Normalized Difference Water Index',
    icon: Droplets,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    formula: '(Green - NIR) / (Green + NIR)',
    bands: [
      { upTo: 0, meaning: 'Dry, non-water surfaces', tone: 'low' as const },
      { upTo: 0.3, meaning: 'Moist soil or wetland conditions', tone: 'mid' as const },
      { upTo: Infinity, meaning: 'Open water present', tone: 'high' as const },
    ],
    gradientColors: ['bg-amber-600', 'bg-yellow-400', 'bg-cyan-300', 'bg-blue-400', 'bg-blue-600'],
  },
  nbr: {
    label: 'NBR',
    fullName: 'Normalized Burn Ratio',
    icon: Flame,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    formula: '(NIR - SWIR2) / (NIR + SWIR2)',
    bands: [
      { upTo: -0.25, meaning: 'High burn severity', tone: 'low' as const },
      { upTo: 0.1, meaning: 'Moderate burn severity', tone: 'mid' as const },
      { upTo: Infinity, meaning: 'Unburned, or vegetation regrowth', tone: 'high' as const },
    ],
    gradientColors: ['bg-gray-800', 'bg-red-600', 'bg-orange-400', 'bg-yellow-300', 'bg-green-500'],
  },
};

const toneBadgeClass: Record<"low" | "mid" | "high", string> = {
  low: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  mid: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  high: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
};

const interpretMean = (config: typeof indexConfig[keyof typeof indexConfig], mean: number) => {
  const num = Number(mean);
  const band = config.bands.find((b) => (isNaN(num) ? true : num <= b.upTo)) || config.bands[config.bands.length - 1];
  return band;
};

// Safe numeric formatter
const safeNumFixed = (val: any, decimals: number = 2): string => {
  const num = Number(val);
  return isNaN(num) ? "0.00" : num.toFixed(decimals);
};

// Normalize index value to 0-100 for progress bar
const normalizeValue = (value: any): number => {
  const num = Number(value);
  const safeVal = isNaN(num) ? 0 : num;
  const normalized = ((safeVal + 1) / 2) * 100;
  return Math.max(0, Math.min(100, normalized));
};

const SpectralIndicesDisplay = ({ spectralIndices, sensorInfo: sensorInfoProp, landsatInfo }: SpectralIndicesDisplayProps) => {
  const [showTechnical, setShowTechnical] = useState(false);
  const sensorInfo = sensorInfoProp ?? landsatInfo;

  if (!spectralIndices) return null;

  const hasAnyIndex = Object.values(spectralIndices).some(v => v !== undefined);
  if (!hasAnyIndex) return null;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">What the imagery shows</h4>
        {sensorInfo && (
          <Badge variant="outline" className="text-xs">
            {sensorInfo.sensor}
            {"statistics_grid" in sensorInfo && sensorInfo.statistics_grid
              ? ` • ${sensorInfo.statistics_grid} statistics grid`
              : "spatial_resolution" in sensorInfo && sensorInfo.spatial_resolution
                ? ` • ${sensorInfo.spatial_resolution}`
                : ""}
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {Object.entries(spectralIndices).map(([key, data]) => {
          if (!data) return null;
          const config = indexConfig[key as keyof typeof indexConfig];
          if (!config) return null;

          const IconComponent = config.icon;
          const reading = interpretMean(config, data.mean);

          return (
            <div key={key} className={`p-3 rounded-lg ${config.bgColor}`}>
              <div className="flex items-start gap-2">
                <IconComponent className={`h-4 w-4 ${config.color} mt-0.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium">{reading.meaning}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium">{config.fullName} ({config.label})</p>
                        <p className="text-xs text-muted-foreground mt-1">{config.formula}</p>
                        <p className="text-xs text-muted-foreground mt-1">Mean value: {safeNumFixed(data.mean, 3)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Badge variant="outline" className={`mt-1 text-[10px] ${toneBadgeClass[reading.tone]}`}>
                    {config.label}
                  </Badge>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between text-xs text-muted-foreground h-7"
        onClick={() => setShowTechnical((v) => !v)}
      >
        <span>Technical values (for the full report)</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showTechnical ? "rotate-180" : ""}`} />
      </Button>

      {showTechnical && (
        <div className="space-y-3 pt-1">
          {Object.entries(spectralIndices).map(([key, data]) => {
            if (!data) return null;
            const config = indexConfig[key as keyof typeof indexConfig];
            if (!config) return null;
            const meanNormalized = normalizeValue(data.mean);

            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
                  <span className={`text-xs font-bold ${config.color}`}>{safeNumFixed(data.mean, 3)}</span>
                </div>
                <div className="relative h-2 rounded-full overflow-hidden flex">
                  {config.gradientColors.map((color, i) => (
                    <div key={i} className={`${color} flex-1 h-full`} />
                  ))}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-md"
                    style={{ left: `${meanNormalized}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Min: {safeNumFixed(data.min, 2)}</span>
                  <span>Max: {safeNumFixed(data.max, 2)}</span>
                </div>
              </div>
            );
          })}

          {sensorInfo && "native_band_resolutions_m" in sensorInfo && sensorInfo.native_band_resolutions_m && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">Native band resolution:</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(sensorInfo.native_band_resolutions_m).map(([band, resolution]) => (
                  <Badge key={band} variant="secondary" className="text-xs">
                    {band}: {resolution} m
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default SpectralIndicesDisplay;
