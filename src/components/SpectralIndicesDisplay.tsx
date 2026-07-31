import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Leaf, Droplets, Flame, Building2, Info } from "lucide-react";
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
    ndbi?: SpectralIndex;
  } | null;
  landsatInfo?: {
    sensor?: string;
    path_row?: string;
    acquisition_dates?: string[];
    spatial_resolution?: string;
    bands_used?: string[];
    processing_level?: string;
  } | null;
}

const indexConfig = {
  ndvi: {
    label: 'NDVI',
    fullName: 'Normalized Difference Vegetation Index',
    icon: Leaf,
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    formula: '(NIR - Red) / (NIR + Red)',
    interpretation: {
      low: { range: '< 0.2', meaning: 'Bare soil, water, or sparse vegetation' },
      mid: { range: '0.2 - 0.5', meaning: 'Moderate vegetation, crops, shrubs' },
      high: { range: '> 0.5', meaning: 'Dense healthy vegetation' },
    },
    gradientColors: ['bg-amber-800', 'bg-yellow-500', 'bg-lime-400', 'bg-green-500', 'bg-green-700'],
  },
  ndwi: {
    label: 'NDWI',
    fullName: 'Normalized Difference Water Index',
    icon: Droplets,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    formula: '(Green - NIR) / (Green + NIR)',
    interpretation: {
      low: { range: '< 0', meaning: 'Non-water surfaces' },
      mid: { range: '0 - 0.3', meaning: 'Moist soil, wetlands' },
      high: { range: '> 0.3', meaning: 'Open water bodies' },
    },
    gradientColors: ['bg-amber-600', 'bg-yellow-400', 'bg-cyan-300', 'bg-blue-400', 'bg-blue-600'],
  },
  nbr: {
    label: 'NBR',
    fullName: 'Normalized Burn Ratio',
    icon: Flame,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    formula: '(NIR - SWIR2) / (NIR + SWIR2)',
    interpretation: {
      low: { range: '< -0.25', meaning: 'High burn severity' },
      mid: { range: '-0.25 - 0.1', meaning: 'Moderate burn severity' },
      high: { range: '> 0.1', meaning: 'Unburned or regrowth' },
    },
    gradientColors: ['bg-gray-800', 'bg-red-600', 'bg-orange-400', 'bg-yellow-300', 'bg-green-500'],
  },
  ndbi: {
    label: 'NDBI',
    fullName: 'Normalized Difference Built-up Index',
    icon: Building2,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50 dark:bg-gray-800/30',
    formula: '(SWIR1 - NIR) / (SWIR1 + NIR)',
    interpretation: {
      low: { range: '< -0.1', meaning: 'Vegetation, water' },
      mid: { range: '-0.1 - 0.1', meaning: 'Mixed land cover' },
      high: { range: '> 0.1', meaning: 'Urban/built-up areas' },
    },
    gradientColors: ['bg-green-600', 'bg-lime-400', 'bg-yellow-400', 'bg-gray-400', 'bg-gray-700'],
  },
};

// Safe numeric formatter
const safeNumFixed = (val: any, decimals: number = 2): string => {
  const num = Number(val);
  return isNaN(num) ? "0.00" : num.toFixed(decimals);
};

// Normalize index value to 0-100 for progress bar
const normalizeValue = (value: any, indexKey: string): number => {
  const num = Number(value);
  const safeVal = isNaN(num) ? 0 : num;
  const normalized = ((safeVal + 1) / 2) * 100;
  return Math.max(0, Math.min(100, normalized));
};

const SpectralIndicesDisplay = ({ spectralIndices, landsatInfo }: SpectralIndicesDisplayProps) => {
  if (!spectralIndices) return null;

  const hasAnyIndex = Object.values(spectralIndices).some(v => v !== undefined);
  if (!hasAnyIndex) return null;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Spectral Indices</h4>
        {landsatInfo && (
          <Badge variant="outline" className="text-xs">
            {landsatInfo.sensor || 'Landsat 8 OLI'} • {landsatInfo.spatial_resolution || '30m'}
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        {Object.entries(spectralIndices).map(([key, data]) => {
          if (!data) return null;
          const config = indexConfig[key as keyof typeof indexConfig];
          if (!config) return null;

          const IconComponent = config.icon;
          const meanNormalized = normalizeValue(data.mean, key);

          return (
            <div key={key} className={`p-3 rounded-lg ${config.bgColor}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <IconComponent className={`h-4 w-4 ${config.color}`} />
                  <span className="font-medium text-sm">{config.label}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium">{config.fullName}</p>
                      <p className="text-xs text-muted-foreground mt-1">{config.formula}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className={`font-bold ${config.color}`}>
                  {safeNumFixed(data.mean, 3)}
                </span>
              </div>

              {/* Gradient bar with marker */}
              <div className="relative h-3 rounded-full overflow-hidden flex mb-2">
                {config.gradientColors.map((color, i) => (
                  <div key={i} className={`${color} flex-1 h-full`} />
                ))}
                {/* Mean marker */}
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-md"
                  style={{ left: `${meanNormalized}%` }}
                />
              </div>

              {/* Stats row */}
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Min: {safeNumFixed(data.min, 2)}</span>
                <span>Mean: {safeNumFixed(data.mean, 2)}</span>
                <span>Max: {safeNumFixed(data.max, 2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Landsat Info Footer */}
      {landsatInfo?.bands_used && (
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-1">Bands Used:</p>
          <div className="flex flex-wrap gap-1">
            {landsatInfo.bands_used.map(band => (
              <Badge key={band} variant="secondary" className="text-xs">
                {band}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

export default SpectralIndicesDisplay;
