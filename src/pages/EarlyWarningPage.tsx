import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Thermometer, Droplets, Wind, CloudRain, Loader2, RefreshCw,
  TrendingUp, Shield, Info, Zap, ChevronDown, AlertTriangle, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { TrendChart } from "@/components/charts/TrendChart";

type WeatherObservation = {
  id: string;
  region_name: string;
  temperature_c: number | null;
  rainfall_mm: number | null;
  soil_moisture: number | null;
  wind_speed_kmh: number | null;
  humidity_percent: number | null;
  observation_date: string;
};

/**
 * Trimmed from the old EarlyWarning.tsx page - its Alerts tab moved to the
 * right-panel AlertsPanel and Thresholds tab moved to SettingsPage; this
 * keeps only the Weather Data + Trends tabs and the manual ingest/evaluate
 * triggers, ported verbatim otherwise.
 */
export default function EarlyWarningPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [observations, setObservations] = useState<WeatherObservation[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to access Early Warning");
        navigate("/auth");
        return;
      }
      await loadObservations();
    })();
  }, []);

  const loadObservations = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase.from("weather_observations").select("*").order("observation_date", { ascending: false }).limit(100);
      if (data) setObservations(data as WeatherObservation[]);
    } catch (err) {
      console.error("Load error:", err);
      toast.error("Failed to load weather data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleIngestWeather = async () => {
    setIsIngesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ingest-weather");
      if (error) throw error;
      toast.success(`Weather data ingested: ${data.ingested} locations`);
      await loadObservations();
    } catch (err: any) {
      toast.error("Failed to ingest weather data: " + err.message);
    } finally {
      setIsIngesting(false);
    }
  };

  const handleEvaluateHazards = async () => {
    setIsEvaluating(true);
    try {
      const { data, error } = await supabase.functions.invoke("evaluate-hazards");
      if (error) throw error;
      toast.success(`Evaluation complete: ${data.alerts_created} new alerts`);
    } catch (err: any) {
      toast.error("Failed to evaluate hazards: " + err.message);
    } finally {
      setIsEvaluating(false);
    }
  };

  const getTrendData = (metric: string) => {
    return observations
      .filter((o) => o[metric as keyof WeatherObservation] !== null)
      .map((o) => ({ date: new Date(o.observation_date).toLocaleDateString(), value: Number(o[metric as keyof WeatherObservation]) || 0 }))
      .reverse()
      .slice(0, 30);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-surface-base">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-gray-50 dark:bg-surface-base p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold bg-gradient-ocean bg-clip-text text-transparent flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              Early Warning System
            </h1>
            <p className="text-muted-foreground mt-1">Automated environmental hazard monitoring for Africa</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleIngestWeather} disabled={isIngesting}>
              {isIngesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Ingest Weather Now
            </Button>
            <Button size="sm" onClick={handleEvaluateHazards} disabled={isEvaluating} className="bg-gradient-ocean hover:opacity-90">
              {isEvaluating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
              Check Hazards Now
            </Button>
          </div>
        </div>

        <Collapsible>
          <Card className="p-4 border-primary/20 bg-primary/5">
            <CollapsibleTrigger className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">How Early Warning detection works</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>Real weather data (temperature, rainfall, soil moisture, wind, humidity) is fetched automatically from the Open-Meteo API every 30 minutes - no AI involved, these are real measurements.</p>
              <p>Your alert thresholds (configured in Settings) are checked automatically every 15 minutes against the latest real reading - simple numeric comparison, not AI judgment. New alerts appear in the Alerts panel.</p>
              <div className="pt-2 border-t border-border/50 flex items-start gap-2">
                <Zap className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p>Because ingestion and evaluation run on a schedule, alerts accumulate even while you're away - you don't need to keep this page open.</p>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Tabs defaultValue="weather" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="weather">Weather Data</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="weather" className="space-y-4">
            {observations.length === 0 ? (
              <Card className="p-8 text-center">
                <CloudRain className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No weather data yet. Click "Ingest Weather Now" to fetch real-time data.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from(new Set(observations.map((o) => o.region_name))).map((region) => {
                  const latest = observations.find((o) => o.region_name === region)!;
                  return (
                    <Card key={region} className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        <h4 className="font-semibold text-sm">{region}</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5"><Thermometer className="h-3 w-3 text-orange-500" /><span className="text-muted-foreground">Temp:</span><span className="font-medium">{latest.temperature_c?.toFixed(1) ?? "—"}°C</span></div>
                        <div className="flex items-center gap-1.5"><CloudRain className="h-3 w-3 text-blue-500" /><span className="text-muted-foreground">Rain:</span><span className="font-medium">{latest.rainfall_mm?.toFixed(1) ?? "—"} mm</span></div>
                        <div className="flex items-center gap-1.5"><Droplets className="h-3 w-3 text-cyan-500" /><span className="text-muted-foreground">Soil:</span><span className="font-medium">{latest.soil_moisture?.toFixed(2) ?? "—"}</span></div>
                        <div className="flex items-center gap-1.5"><Wind className="h-3 w-3 text-purple-500" /><span className="text-muted-foreground">Wind:</span><span className="font-medium">{latest.wind_speed_kmh?.toFixed(1) ?? "—"} km/h</span></div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Updated: {new Date(latest.observation_date).toLocaleString()}</p>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            {observations.length === 0 ? (
              <Card className="p-8 text-center">
                <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No data to chart. Ingest weather data first.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TrendChart data={getTrendData("temperature_c")} title="Temperature Trend (°C)" color="hsl(25 95% 53%)" />
                <TrendChart data={getTrendData("rainfall_mm")} title="Rainfall Trend (mm)" color="hsl(210 100% 50%)" />
                <TrendChart data={getTrendData("soil_moisture")} title="Soil Moisture Trend" color="hsl(180 70% 45%)" />
                <TrendChart data={getTrendData("wind_speed_kmh")} title="Wind Speed Trend (km/h)" color="hsl(270 70% 55%)" />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
