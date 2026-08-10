import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import { supabase } from "@/integrations/supabase/client";
import { useMapContext } from "@/contexts/MapContext";

interface ThresholdRow {
  id: string;
  region_name: string;
  lat: number;
  lng: number;
  hazard_type: string;
  is_active: boolean;
}

/**
 * Renders the "Monitored region" markers the MapLegend promises - one per
 * active early-warning threshold. Same maplibregl.Marker-in-canvas pattern
 * as AlertMarkers, kept as a separate overlay since thresholds and alerts
 * are different tables with different lifecycles.
 */
export function MonitoredRegionMarkers() {
  const { map, mapReady } = useMapContext();
  const navigate = useNavigate();
  const [thresholds, setThresholds] = useState<ThresholdRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("monitoring_thresholds")
        .select("id, region_name, lat, lng, hazard_type, is_active")
        .eq("is_active", true);
      if (!cancelled && data) setThresholds(data as ThresholdRow[]);
    };
    load();

    const channel = supabase
      .channel("map-monitoring-thresholds")
      .on("postgres_changes", { event: "*", schema: "public", table: "monitoring_thresholds" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!map || !mapReady) return;
    const markers: maplibregl.Marker[] = [];

    thresholds.forEach((t) => {
      if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng)) return;

      const el = document.createElement("div");
      el.style.cursor = "pointer";
      Object.assign(el.style, {
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        background: "#3b82f6",
        border: "2px solid rgba(255,255,255,0.6)",
      });
      el.title = `${t.region_name} (${t.hazard_type})`;
      el.addEventListener("click", () => navigate("/early-warning"));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([t.lng, t.lat])
        .addTo(map);
      markers.push(marker);
    });

    return () => markers.forEach((m) => m.remove());
  }, [map, mapReady, thresholds, navigate]);

  return null;
}
