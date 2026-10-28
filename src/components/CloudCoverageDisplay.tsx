import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Cloud, CloudOff, CloudRain, CheckCircle2, AlertTriangle, Info } from "lucide-react";

interface CloudCoverageDisplayProps {
  cloudCoverage?: number | null;
  dataQuality?: number | null;
  sensorType?: string;
  acquisitionDate?: string;
}

const CloudCoverageDisplay = ({
  cloudCoverage = null,
  dataQuality = null,
  sensorType = "Sentinel-2 MSI L2A",
  acquisitionDate
}: CloudCoverageDisplayProps) => {
  const normalizedCloudCoverage = typeof cloudCoverage === "number" ? cloudCoverage : null;
  const normalizedDataQuality = typeof dataQuality === "number" ? dataQuality : null;

  const hasMetrics = normalizedCloudCoverage !== null && normalizedDataQuality !== null;
  const isUsable = normalizedCloudCoverage !== null && normalizedDataQuality !== null && normalizedCloudCoverage <= 20 && normalizedDataQuality >= 70;

  const getCloudIcon = () => {
    if (normalizedCloudCoverage === null) return <Info className="h-4 w-4 text-muted-foreground" />;
    if (normalizedCloudCoverage <= 10) return <CloudOff className="h-4 w-4 text-emerald-500" />;
    if (normalizedCloudCoverage <= 30) return <Cloud className="h-4 w-4 text-amber-500" />;
    return <CloudRain className="h-4 w-4 text-destructive" />;
  };

  const getCloudStatus = () => {
    if (normalizedCloudCoverage === null) return { label: "Unavailable", color: "bg-muted" };
    if (normalizedCloudCoverage <= 10) return { label: "Clear", color: "bg-emerald-500" };
    if (normalizedCloudCoverage <= 20) return { label: "Minimal", color: "bg-emerald-400" };
    if (normalizedCloudCoverage <= 30) return { label: "Low", color: "bg-amber-400" };
    if (normalizedCloudCoverage <= 50) return { label: "Moderate", color: "bg-amber-500" };
    return { label: "High", color: "bg-destructive" };
  };

  const getQualityStatus = () => {
    if (normalizedDataQuality === null) return { label: "Unavailable", color: "text-muted-foreground" };
    if (normalizedDataQuality >= 90) return { label: "Excellent", color: "text-emerald-500" };
    if (normalizedDataQuality >= 80) return { label: "Good", color: "text-emerald-400" };
    if (normalizedDataQuality >= 70) return { label: "Acceptable", color: "text-amber-500" };
    if (normalizedDataQuality >= 50) return { label: "Low", color: "text-amber-600" };
    return { label: "Poor", color: "text-destructive" };
  };

  const cloudStatus = getCloudStatus();
  const qualityStatus = getQualityStatus();

  return (
    <TooltipProvider>
      <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            Data Quality Metrics
          </span>
          {hasMetrics && isUsable ? (
            <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Usable
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Limited
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Cloud Coverage */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    {getCloudIcon()}
                    Cloud Cover
                  </span>
                  <span className="font-medium">{normalizedCloudCoverage === null ? "Unavailable" : `${normalizedCloudCoverage.toFixed(1)}%`}</span>
                </div>
                <Progress 
                  value={normalizedCloudCoverage === null ? 0 : 100 - normalizedCloudCoverage} 
                  className="h-1.5" 
                />
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {normalizedCloudCoverage === null ? "Unavailable" : cloudStatus.label}
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                Cloud coverage affects visibility. &lt;20% recommended for accurate analysis.
              </p>
            </TooltipContent>
          </Tooltip>

          {/* Valid Pixel Coverage */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Valid Pixels</span>
                  <span className={`font-medium ${qualityStatus.color}`}>{normalizedDataQuality === null ? "Unavailable" : `${normalizedDataQuality}%`}</span>
                </div>
                <Progress 
                  value={normalizedDataQuality ?? 0} 
                  className="h-1.5" 
                />
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {normalizedDataQuality === null ? "Unavailable" : qualityStatus.label}
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                Share of pixels with valid data after the Scene Classification Layer mask.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Sensor Info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>Sensor: {sensorType}</span>
          {acquisitionDate && <span>{acquisitionDate}</span>}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default CloudCoverageDisplay;
