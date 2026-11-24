import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Thermometer, CloudRain, Droplets, Wind, Activity, Zap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCallback } from "react";
import type { Database } from "@/integrations/supabase/types";

interface RealTimeRegionalStatusProps {
  regionName?: string;
  lat?: number;
  lng?: number;
}

const RealTimeRegionalStatus = ({ regionName, lat, lng }: RealTimeRegionalStatusProps) => {
  type WeatherObservation = Database["public"]["Tables"]["weather_observations"]["Row"];
  const [status, setStatus] = useState<WeatherObservation | null>(null);
  const [narrative, setNarrative] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);

  const generateNarrative = useCallback(async (obs: WeatherObservation) => {
    setIsGeneratingNarrative(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          messages: [
            {
              role: "user",
              content: `Based on these real-time environmental readings for ${obs.region_name}, provide a concise 2-3 sentence plain-language summary of current conditions and any concerns:
              
Temperature: ${obs.temperature_c}°C
Rainfall: ${obs.rainfall_mm}mm
Soil Moisture: ${obs.soil_moisture}
Wind Speed: ${obs.wind_speed_kmh} km/h
Humidity: ${obs.humidity_percent}%
NDVI: ${obs.ndvi_value || 'N/A'}
NDWI: ${obs.ndwi_value || 'N/A'}
Date: ${obs.observation_date}

Focus on what is actually happening right now - describe conditions in simple terms a non-scientist would understand.`
            }
          ]
        }
      });

      if (error) throw error;
      const response = data as { response?: string; choices?: { message?: { content?: string } }[] } | null;
      setNarrative(response?.response || response?.choices?.[0]?.message?.content || "Unable to generate narrative.");
    } catch {
      setNarrative("Real-time narrative unavailable. See metrics below for current conditions.");
    } finally {
      setIsGeneratingNarrative(false);
    }
  }, []);

  const fetchLatestStatus = useCallback(async () => {
    if (!regionName) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("weather_observations")
        .select("*")
        .eq("region_name", regionName)
        .order("observation_date", { ascending: false })
        .limit(1);

      if (error) throw error;
      if (data && data.length > 0) {
        setStatus(data[0]);
        await generateNarrative(data[0]);
      }
    } catch (err) {
      console.error("Failed to fetch status:", err);
    } finally {
      setIsLoading(false);
    }
  }, [generateNarrative, regionName]);

  useEffect(() => {
    if (regionName) {
      fetchLatestStatus();
    }
  }, [fetchLatestStatus, regionName]);

  // Realtime subscription for weather updates
  useEffect(() => {
    if (!regionName) return;

    const channel = supabase
      .channel(`weather-realtime-${regionName}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "weather_observations" },
        (payload) => {
          const obs = payload.new as WeatherObservation;
          if (obs.region_name === regionName) {
            setStatus(obs);
            generateNarrative(obs);
            toast.info(`📡 Live update for ${regionName}`);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [generateNarrative, regionName]);

  const handleRefresh = async () => {
    try {
      toast.info("Fetching latest data...");
      await supabase.functions.invoke("ingest-weather");
      await fetchLatestStatus();
      toast.success("Data refreshed!");
    } catch {
      toast.error("Failed to refresh data");
    }
  };

  if (!regionName) {
    return (
      <Card className="p-4 text-center">
        <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Select a region to see real-time conditions</p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-4 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
        <span className="text-sm">Loading real-time data...</span>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-green-500 animate-pulse" />
          <span className="text-sm font-medium">Live Conditions</span>
          <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-500 border-green-500/20">
            LIVE
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* AI Narrative */}
      {(narrative || isGeneratingNarrative) && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex items-start gap-2">
            <Zap className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-primary mb-1">What's Happening Now</p>
              {isGeneratingNarrative ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-xs text-muted-foreground">Analyzing conditions...</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed">{narrative}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Metrics Grid */}
      {status && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-2.5">
            <div className="flex items-center gap-1.5">
              <Thermometer className="h-3.5 w-3.5 text-orange-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Temperature</p>
                <p className="text-sm font-bold">{status.temperature_c?.toFixed(1) ?? "—"}°C</p>
              </div>
            </div>
          </Card>
          <Card className="p-2.5">
            <div className="flex items-center gap-1.5">
              <CloudRain className="h-3.5 w-3.5 text-blue-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Rainfall</p>
                <p className="text-sm font-bold">{status.rainfall_mm?.toFixed(1) ?? "—"} mm</p>
              </div>
            </div>
          </Card>
          <Card className="p-2.5">
            <div className="flex items-center gap-1.5">
              <Droplets className="h-3.5 w-3.5 text-cyan-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Soil Moisture</p>
                <p className="text-sm font-bold">{status.soil_moisture?.toFixed(3) ?? "—"}</p>
              </div>
            </div>
          </Card>
          <Card className="p-2.5">
            <div className="flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5 text-purple-500" />
              <div>
                <p className="text-[10px] text-muted-foreground">Wind Speed</p>
                <p className="text-sm font-bold">{status.wind_speed_kmh?.toFixed(1) ?? "—"} km/h</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {status && (
        <p className="text-[10px] text-muted-foreground text-center">
          Last updated: {new Date(status.observation_date).toLocaleString()} • Source: Open-Meteo API
        </p>
      )}
    </div>
  );
};

export default RealTimeRegionalStatus;
