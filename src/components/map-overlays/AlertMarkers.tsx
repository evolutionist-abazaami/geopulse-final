import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import { supabase } from "@/integrations/supabase/client";
import { useMapContext } from "@/contexts/MapContext";

type Severity = "low" | "moderate" | "high" | "critical";

interface HazardAlertRow {
  id: string;
  region_name: string;
  lat: number;
  lng: number;
  severity: Severity | string;
  is_resolved: boolean;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#ef4444",
  moderate: "#f59e0b",
  low: "#22c55e",
};

/**
 * Renders nothing itself - alert pins live directly in the MapLibre canvas
 * via maplibregl.Marker so they stay anchored to real coordinates as the
 * shared map pans/zooms, unlike an absolutely-positioned HTML overlay would.
 */
export function AlertMarkers() {
  const { map, mapReady } = useMapContext();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<HazardAlertRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("hazard_alerts")
        .select("id, region_name, lat, lng, severity, is_resolved")
        .eq("is_resolved", false)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!cancelled && data) setAlerts(data as HazardAlertRow[]);
    };
    load();

    const channel = supabase
      .channel("map-hazard-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "hazard_alerts" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "hazard_alerts" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!map || !mapReady) return;
    const markers: maplibregl.Marker[] = [];

    alerts.forEach((alert) => {
      if (!Number.isFinite(alert.lat) || !Number.isFinite(alert.lng)) return;

      const color = SEVERITY_COLOR[alert.severity] || SEVERITY_COLOR.low;
      const el = document.createElement("div");
      el.style.position = "relative";
      el.style.cursor = "pointer";

      const dot = document.createElement("div");
      const size = alert.severity === "critical" ? "12px" : "10px";
      Object.assign(dot.style, {
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        border: "2px solid rgba(255,255,255,0.6)",
      });
      el.appendChild(dot);

      if (alert.severity === "critical") {
        const ring = document.createElement("div");
        Object.assign(ring.style, {
          position: "absolute",
          inset: "-4px",
          borderRadius: "50%",
          background: "rgba(239,68,68,0.3)",
          animation: "pulse-ring 2s ease-in-out infinite",
        });
        el.appendChild(ring);
      }

      el.addEventListener("click", () => navigate("/early-warning"));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([alert.lng, alert.lat])
        .addTo(map);
      markers.push(marker);
    });

    return () => markers.forEach((m) => m.remove());
  }, [map, mapReady, alerts, navigate]);

  return null;
}
