import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, GitCompare, TrendingUp, TrendingDown, Minus, Map, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import LocationSearch from "./LocationSearch";
import { ComparisonChart } from "./charts/ComparisonChart";
import SplitMapComparison from "./SplitMapComparison";
import AnimatedMapTransition from "./AnimatedMapTransition";
import ComparisonReportGenerator, { type ComparisonResult } from "./ComparisonReportGenerator";
import type { GeocodedPlace } from "@/types/geospatial";

interface SatelliteAnalysisResponse {
  analysisMethod: "measured";
  fallback?: boolean;
  changePercent: number;
  area?: string | null;
  sensorInfo?: { sensor?: string };
  fieldProvenance: {
    changePercent?: { origin?: string };
  };
}

const isMeasuredAnalysis = (value: unknown): value is SatelliteAnalysisResponse => {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const provenance = data.fieldProvenance;
  if (!provenance || typeof provenance !== "object") return false;
  const changeProvenance = (provenance as Record<string, unknown>).changePercent;
  if (!changeProvenance || typeof changeProvenance !== "object") return false;
  const changeOrigin = (changeProvenance as Record<string, unknown>).origin;
  if (data.area !== undefined && data.area !== null && typeof data.area !== "string") return false;
  if (data.sensorInfo !== undefined && data.sensorInfo !== null) {
    if (typeof data.sensorInfo !== "object") return false;
    const sensor = (data.sensorInfo as Record<string, unknown>).sensor;
    if (sensor !== undefined && typeof sensor !== "string") return false;
  }

  return data.analysisMethod === "measured" &&
    data.fallback !== true &&
    typeof data.changePercent === "number" &&
    Number.isFinite(data.changePercent) &&
    changeOrigin === "measured";
};

interface ComparisonModeProps {
  onComparisonComplete?: (result: ComparisonResult) => void;
}

const eventTypes = [
  { value: "deforestation", label: "Deforestation", icon: "🌳" },
  { value: "vegetation_loss", label: "Vegetation Loss", icon: "🍃" },
  { value: "flood", label: "Flood", icon: "🌊" },
  { value: "drought", label: "Drought", icon: "🏜️" },
  { value: "urbanization", label: "Urbanization", icon: "🏙️" },
  { value: "wildfire", label: "Wildfire", icon: "🔥" },
];

const ComparisonMode = ({ onComparisonComplete }: ComparisonModeProps) => {
  const [eventType, setEventType] = useState("deforestation");
  const [selectedLocation, setSelectedLocation] = useState<GeocodedPlace | null>(null);
  
  // Period 1
  const [period1Start, setPeriod1Start] = useState("2020-01-01");
  const [period1End, setPeriod1End] = useState("2021-01-01");
  
  // Period 2
  const [period2Start, setPeriod2Start] = useState("2023-01-01");
  const [period2End, setPeriod2End] = useState("2024-01-01");
  
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [showSplitMap, setShowSplitMap] = useState(true);
  const [viewMode, setViewMode] = useState<"split" | "animated">("split");

  const handleLocationSelect = (location: GeocodedPlace) => {
    setSelectedLocation(location);
  };

  const runComparison = async () => {
    if (!selectedLocation) {
      toast.error("Please select a location first");
      return;
    }

    setIsComparing(true);
    setComparisonResult(null);
    toast.info("Running comparative analysis...");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

      // Run analysis for both periods in parallel
      const [period1Response, period2Response] = await Promise.all([
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-satellite`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            eventType,
            region: selectedLocation.name,
            startDate: period1Start,
            endDate: period1End,
            coordinates: { lat: selectedLocation.lat, lng: selectedLocation.lng },
            geometry: selectedLocation.geometry,
          }),
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-satellite`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            eventType,
            region: selectedLocation.name,
            startDate: period2Start,
            endDate: period2End,
            coordinates: { lat: selectedLocation.lat, lng: selectedLocation.lng },
            geometry: selectedLocation.geometry,
          }),
        }),
      ]);

      if (!period1Response.ok || !period2Response.ok) {
        throw new Error("One or both satellite analysis requests failed. No comparison was generated.");
      }

      const period1Payload: unknown = await period1Response.json();
      const period2Payload: unknown = await period2Response.json();

      if (!isMeasuredAnalysis(period1Payload) || !isMeasuredAnalysis(period2Payload)) {
        toast.warning("Measured data is unavailable for one or both periods. No comparison was generated.");
        return;
      }

      const period1Data = period1Payload;
      const period2Data = period2Payload;

      const period1Change = period1Data.changePercent;
      const period2Change = period2Data.changePercent;
      const difference = period2Change - period1Change;
      const trend: ComparisonResult["comparison"]["trend"] =
        difference > 0 ? "higher" : difference < 0 ? "lower" : "similar";
      const result = {
        location: selectedLocation.name,
        eventType,
        period1: {
          range: `${period1Start} to ${period1End}`,
          changePercent: period1Change,
          area: period1Data.area ?? "Unavailable",
          sensor: period1Data.sensorInfo?.sensor ?? "Unavailable",
        },
        period2: {
          range: `${period2Start} to ${period2End}`,
          changePercent: period2Change,
          area: period2Data.area ?? "Unavailable",
          sensor: period2Data.sensorInfo?.sensor ?? "Unavailable",
        },
        comparison: {
          trend,
          difference: Math.abs(difference).toFixed(1),
          insight: `The measured NDVI change metric is ${Math.abs(difference).toFixed(1)} percentage points ${difference > 0 ? "higher" : difference < 0 ? "lower" : "unchanged"} in period 2. This does not establish a cause or event-specific impact.`,
        },
        chartData: [
          { name: "NDVI change", before: period1Change, after: period2Change },
        ],
      };

      setComparisonResult(result);
      onComparisonComplete?.(result);
      toast.success("Comparison complete!");

    } catch (error) {
      console.error("Comparison API request failed:", error);
      setComparisonResult(null);
      toast.error(error instanceof Error ? error.message : "Comparison failed. No measurements were returned.");
    } finally {
      setIsComparing(false);
    }
  };

  const getTrendIcon = () => {
    if (!comparisonResult) return null;
    switch (comparisonResult.comparison.trend) {
      case "higher":
        return <TrendingUp className="h-5 w-5 text-muted-foreground" />;
      case "lower":
        return <TrendingDown className="h-5 w-5 text-muted-foreground" />;
      default:
        return <Minus className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <GitCompare className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-lg">Comparison Mode</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Event Type</label>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eventTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <span className="flex items-center gap-2">
                    <span>{type.icon}</span>
                    {type.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Location</label>
          <LocationSearch
            onLocationSelect={handleLocationSelect}
            onInputChange={() => setSelectedLocation(null)}
            placeholder="Search location..."
            defaultValue={selectedLocation?.name}
          />
        </div>

        <Card className="p-4 bg-muted/30">
          <p className="text-sm font-medium mb-3 text-primary">Period 1 (Before)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Start</label>
              <DatePicker value={period1Start} onChange={setPeriod1Start} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End</label>
              <DatePicker value={period1End} onChange={setPeriod1End} className="w-full" />
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-muted/30">
          <p className="text-sm font-medium mb-3 text-secondary">Period 2 (After)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Start</label>
              <DatePicker value={period2Start} onChange={setPeriod2Start} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End</label>
              <DatePicker value={period2End} onChange={setPeriod2End} className="w-full" />
            </div>
          </div>
        </Card>

        <Button
          className="w-full"
          onClick={runComparison}
          disabled={isComparing || !selectedLocation}
        >
          {isComparing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Comparing...
            </>
          ) : (
            <>
              <GitCompare className="h-4 w-4 mr-2" />
              Run Comparison
            </>
          )}
        </Button>
      </div>

      {/* Map View Controls */}
      {selectedLocation && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Map className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Map Visualization</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-border overflow-hidden">
                <Button
                  variant={viewMode === "split" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setViewMode("split")}
                >
                  <Map className="h-4 w-4 mr-1" />
                  Split
                </Button>
                <Button
                  variant={viewMode === "animated" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setViewMode("animated")}
                >
                  <PlayCircle className="h-4 w-4 mr-1" />
                  Animate
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSplitMap(!showSplitMap)}
              >
                {showSplitMap ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
          
          {showSplitMap && viewMode === "split" && (
            <SplitMapComparison
              center={[selectedLocation.lat, selectedLocation.lng]}
              zoom={10}
              period1Label={comparisonResult ? comparisonResult.period1.range : `${period1Start} - ${period1End}`}
              period2Label={comparisonResult ? comparisonResult.period2.range : `${period2Start} - ${period2End}`}
              period1Data={comparisonResult?.period1}
              period2Data={comparisonResult?.period2}
              selectedLocation={selectedLocation}
            />
          )}

          {showSplitMap && viewMode === "animated" && (
            <AnimatedMapTransition
              center={[selectedLocation.lat, selectedLocation.lng]}
              zoom={10}
              period1Label={comparisonResult ? comparisonResult.period1.range : `${period1Start} - ${period1End}`}
              period2Label={comparisonResult ? comparisonResult.period2.range : `${period2Start} - ${period2End}`}
              period1Data={comparisonResult?.period1}
              period2Data={comparisonResult?.period2}
              selectedLocation={selectedLocation}
            />
          )}
        </div>
      )}

      {/* Comparison Results */}
      {comparisonResult && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <h4 className="font-bold">Comparison Results</h4>
            {getTrendIcon()}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3 bg-primary/5 border-primary/20">
              <p className="text-xs text-muted-foreground mb-1">Period 1 NDVI change</p>
              <p className="text-2xl font-bold text-primary">{comparisonResult.period1.changePercent}%</p>
              <p className="text-xs text-muted-foreground truncate">{comparisonResult.period1.range}</p>
            </Card>
            <Card className="p-3 bg-secondary/5 border-secondary/20">
              <p className="text-xs text-muted-foreground mb-1">Period 2 NDVI change</p>
              <p className="text-2xl font-bold text-secondary">{comparisonResult.period2.changePercent}%</p>
              <p className="text-xs text-muted-foreground truncate">{comparisonResult.period2.range}</p>
            </Card>
          </div>

          <Card className="p-3">
            <div className="flex items-center gap-2 mb-2">
              {getTrendIcon()}
              <span className="text-sm font-medium capitalize">{comparisonResult.comparison.trend}</span>
              <span className="text-sm text-muted-foreground">({comparisonResult.comparison.difference} percentage points)</span>
            </div>
            <p className="text-sm text-muted-foreground">{comparisonResult.comparison.insight}</p>
          </Card>

          <ComparisonChart
            data={comparisonResult.chartData}
            title="Period Comparison"
          />

          <ComparisonReportGenerator comparisonResult={comparisonResult} />
        </div>
      )}
    </div>
  );
};

export default ComparisonMode;
