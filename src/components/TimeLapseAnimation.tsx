import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, SkipBack, SkipForward, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import LocationSearch from "./LocationSearch";
import { TrendChart } from "./charts/TrendChart";
import type { GeocodedPlace } from "@/types/geospatial";

interface TimeLapseAnimationProps {
  onFrameChange?: (frame: TimeFrame) => void;
  mapCenter?: [number, number];
}

interface TimeFrame {
  date: string;
  label: string;
  value: number | null;
  data?: AnalysisResult;
}

interface AnalysisResult extends Record<string, unknown> {
  fallback?: boolean;
  analysisMethod?: string;
  fallbackReason?: string;
  changePercent?: number | null;
}

const eventTypes = [
  { value: "deforestation", label: "Deforestation", icon: "🌳" },
  { value: "vegetation_loss", label: "Vegetation Loss", icon: "🍃" },
  { value: "drought", label: "Drought", icon: "🏜️" },
  { value: "urbanization", label: "Urbanization", icon: "🏙️" },
];

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (result.fallback === undefined || typeof result.fallback === "boolean")
    && (result.analysisMethod === undefined || typeof result.analysisMethod === "string")
    && (result.fallbackReason === undefined || typeof result.fallbackReason === "string")
    && (result.changePercent === undefined || result.changePercent === null || typeof result.changePercent === "number");
}

const isFallbackAnalysis = (data: AnalysisResult) => Boolean(
  data?.fallback || data?.analysisMethod !== "measured" || data?.fallbackReason === "SERVICE_UNAVAILABLE",
);

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await worker(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

const TimeLapseAnimation = ({ onFrameChange, mapCenter }: TimeLapseAnimationProps) => {
  const [eventType, setEventType] = useState("deforestation");
  const [selectedLocation, setSelectedLocation] = useState<GeocodedPlace | null>(null);
  const [startYear, setStartYear] = useState(2018);
  const [endYear, setEndYear] = useState(2024);
  const [frames, setFrames] = useState<TimeFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateTimeFrames = useCallback(() => {
    const newFrames: TimeFrame[] = [];
    for (let year = startYear; year <= endYear; year++) {
      newFrames.push({
        date: `${year}-01-01`,
        label: year.toString(),
        value: null,
      });
    }
    return newFrames;
  }, [startYear, endYear]);

  const loadTimelapseData = async () => {
    if (!selectedLocation) {
      toast.error("Please select a location first");
      return;
    }
    if (endYear < startYear) {
      toast.error("The end year must be the same as or later than the start year.");
      return;
    }
    if (endYear - startYear >= 10) {
      toast.error("Select a range of no more than 10 years to limit analysis requests.");
      return;
    }

    setIsLoading(true);
    setIsPlaying(false);
    toast.info("Loading time-lapse data...");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

      const sourceFrames = generateTimeFrames();
      const loadedFrames = await mapWithConcurrency(sourceFrames, 2, async (frame) => {
        const endDate = `${parseInt(frame.label)}-12-31`;
        
        try {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-satellite`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              eventType,
              region: selectedLocation.name,
              startDate: frame.date,
              endDate,
              coordinates: { lat: selectedLocation.lat, lng: selectedLocation.lng },
              geometry: selectedLocation.geometry,
            }),
          });

          if (response.ok) {
            const payload: unknown = await response.json();
            if (!isAnalysisResult(payload)) throw new Error("Analysis service returned an invalid response.");
            const data = payload;
            return {
              ...frame,
              value: !isFallbackAnalysis(data) && typeof data.changePercent === "number"
                ? data.changePercent
                : null,
              data,
            };
          } else {
            console.error(`Time-lapse frame ${frame.label} failed with status ${response.status}.`);
          }
        } catch (error) {
          console.error(`Error loading frame ${frame.label}:`, error);
        }

        return { ...frame, value: null };
      });

      setFrames(loadedFrames);
      setCurrentFrameIndex(0);
      const unavailableCount = loadedFrames.filter((frame) => frame.value === null).length;
      if (unavailableCount > 0) {
        toast.warning(`${loadedFrames.length - unavailableCount} of ${loadedFrames.length} time frames had measurements. Unavailable frames are left blank.`);
      } else {
        toast.success(`Loaded ${loadedFrames.length} time frames`);
      }

    } catch (error) {
      console.error("Timelapse load error:", error);
      toast.error("Failed to load time-lapse data");
    } finally {
      setIsLoading(false);
    }
  };

  // Animation playback
  useEffect(() => {
    if (isPlaying && frames.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentFrameIndex((prev) => {
          const next = prev + 1;
          if (next >= frames.length) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, playbackSpeed);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, frames.length, playbackSpeed]);

  // Notify parent of frame changes
  useEffect(() => {
    if (frames[currentFrameIndex] && onFrameChange) {
      onFrameChange(frames[currentFrameIndex]);
    }
  }, [currentFrameIndex, frames, onFrameChange]);

  const handlePlayPause = () => {
    if (frames.length === 0) {
      toast.error("Load time-lapse data first");
      return;
    }
    setIsPlaying(!isPlaying);
  };

  const handlePrevFrame = () => {
    setIsPlaying(false);
    setCurrentFrameIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextFrame = () => {
    setIsPlaying(false);
    setCurrentFrameIndex((prev) => Math.min(frames.length - 1, prev + 1));
  };

  const handleSliderChange = (value: number[]) => {
    setIsPlaying(false);
    setCurrentFrameIndex(value[0]);
  };

  const chartData = frames.map((frame) => ({
    date: frame.label,
    value: frame.value,
  }));

  const currentFrame = frames[currentFrameIndex];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-lg">Time-Lapse Animation</h3>
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
            onLocationSelect={(loc) => setSelectedLocation(loc)}
            onInputChange={() => setSelectedLocation(null)}
            placeholder="Search location..."
            defaultValue={selectedLocation?.name}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-2 block">Start Year</label>
            <Select value={startYear.toString()} onValueChange={(v) => setStartYear(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 20 }, (_, i) => 2010 + i).map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">End Year</label>
            <Select value={endYear.toString()} onValueChange={(v) => setEndYear(parseInt(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 20 }, (_, i) => 2010 + i).map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Playback Speed</label>
          <Select value={playbackSpeed.toString()} onValueChange={(v) => setPlaybackSpeed(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="500">Fast (0.5s)</SelectItem>
              <SelectItem value="1000">Normal (1s)</SelectItem>
              <SelectItem value="2000">Slow (2s)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full"
          onClick={loadTimelapseData}
          disabled={isLoading || !selectedLocation}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Clock className="h-4 w-4 mr-2" />
              Load Time-Lapse
            </>
          )}
        </Button>
      </div>

      {/* Playback Controls */}
      {frames.length > 0 && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-primary">
              {currentFrame?.label || "-"}
            </span>
            <span className="text-sm text-muted-foreground">
              {currentFrameIndex + 1} / {frames.length}
            </span>
          </div>

          {currentFrame && (
            <div className={currentFrame.value === null ? "p-3 rounded-lg bg-warning-dim border border-warning/30" : "p-3 rounded-lg bg-muted/50"}>
              <p className="text-sm">
                <span className="font-medium">{eventType}</span>: {currentFrame.value === null ? "No measured value available" : `${currentFrame.value.toFixed(1)}% measured NDVI change`}
              </p>
              {currentFrame.value === null && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  No valid satellite measurement was returned for {currentFrame.label}.
                </p>
              )}
            </div>
          )}

          <Slider
            value={[currentFrameIndex]}
            min={0}
            max={frames.length - 1}
            step={1}
            onValueChange={handleSliderChange}
          />

          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevFrame} disabled={currentFrameIndex === 0}>
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button size="icon" onClick={handlePlayPause}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={handleNextFrame} disabled={currentFrameIndex === frames.length - 1}>
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Timeline Chart */}
          <TrendChart
            data={chartData}
            title="Change Over Time"
            color="hsl(var(--primary))"
          />
        </Card>
      )}
    </div>
  );
};

export default TimeLapseAnimation;
