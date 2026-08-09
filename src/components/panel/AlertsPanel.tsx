import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, AlertTriangle, Droplets, Thermometer, Wind } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useMapContext } from "@/contexts/MapContext";
import { toast } from "sonner";

type Severity = "low" | "moderate" | "high" | "critical";

type HazardAlert = {
  id: string;
  region_name: string;
  lat: number;
  lng: number;
  hazard_type: string;
  severity: Severity | string;
  title: string;
  description: string | null;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
};

const HAZARD_ICON: Record<string, typeof AlertTriangle> = {
  flood: Droplets,
  drought: Thermometer,
  heatwave: Thermometer,
  storm: Wind,
};

/**
 * Alerts list + realtime subscription + mark-read/resolve, lifted from
 * EarlyWarning.tsx's Alerts tab - same hazard_alerts queries/mutations,
 * same channel subscription pattern, now living in the right panel instead
 * of a dedicated page tab.
 */
export function AlertsPanel() {
  const { flyToBounds } = useMapContext();
  const [alerts, setAlerts] = useState<HazardAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAlerts = async () => {
    const { data } = await supabase
      .from("hazard_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setAlerts(data as HazardAlert[]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadAlerts();

    const channel = supabase
      .channel("panel-hazard-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "hazard_alerts" },
        (payload) => {
          const newAlert = payload.new as HazardAlert;
          setAlerts((prev) => [newAlert, ...prev]);
          toast.warning(`New ${newAlert.hazard_type} alert: ${newAlert.region_name}`, { duration: 8000 });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleMarkRead = async (id: string) => {
    const { error } = await supabase.from("hazard_alerts").update({ is_read: true }).eq("id", id);
    if (!error) setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
  };

  const handleResolve = async (id: string) => {
    const { error } = await supabase
      .from("hazard_alerts")
      .update({ is_resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_resolved: true } : a)));
      toast.success("Alert resolved");
    }
  };

  const markAllRead = async () => {
    const unreadIds = alerts.filter((a) => !a.is_read).map((a) => a.id);
    if (unreadIds.length === 0) return;
    const { error } = await supabase.from("hazard_alerts").update({ is_read: true }).in("id", unreadIds);
    if (!error) setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
  };

  const active = alerts.filter((a) => !a.is_resolved);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-200 dark:border-border-subtle flex-shrink-0">
        <span className="text-[12px] text-gray-500 dark:text-v2-muted">{active.length} active</span>
        <button
          onClick={markAllRead}
          className="text-[12px] text-brand hover:text-blue-500 transition-colors duration-fast"
        >
          Mark all read
        </button>
      </div>

      {!isLoading && active.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <CheckCircle className="w-10 h-10 text-stable mb-3" />
          <p className="text-[13px] text-gray-700 dark:text-v2-secondary font-medium">All clear</p>
          <p className="text-[12px] text-gray-400 dark:text-v2-muted mt-1">No active alerts</p>
        </div>
      )}

      <div className="p-2 space-y-1">
        {active.map((alert) => {
          const Icon = HAZARD_ICON[alert.hazard_type] || AlertTriangle;
          return (
            <button
              key={alert.id}
              onClick={() => {
                if (!alert.is_read) handleMarkRead(alert.id);
                if (Number.isFinite(alert.lat) && Number.isFinite(alert.lng)) {
                  flyToBounds({
                    north: alert.lat + 0.3, south: alert.lat - 0.3,
                    east: alert.lng + 0.3, west: alert.lng - 0.3,
                  });
                }
              }}
              className="flex items-start gap-2.5 w-full p-2.5 rounded-md text-left hover:bg-gray-50 dark:hover:bg-surface-2 transition-all duration-fast group"
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0",
                  alert.severity === "critical" || alert.severity === "high"
                    ? "bg-critical-dim text-critical"
                    : alert.severity === "moderate"
                    ? "bg-warning-dim text-warning"
                    : "bg-stable-dim text-stable"
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-[13px]", alert.is_read ? "text-gray-500 dark:text-v2-secondary" : "text-gray-900 dark:text-v2-primary font-medium")}>
                  {alert.title}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-v2-muted">
                  {alert.region_name} · {new Date(alert.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleResolve(alert.id); }}
                title="Resolve"
                className="text-gray-300 dark:text-v2-disabled hover:text-stable transition-colors duration-fast flex-shrink-0 mt-0.5"
              >
                <CheckCircle className="w-4 h-4" />
              </button>
            </button>
          );
        })}
      </div>

      <div className="border-t border-gray-200 dark:border-border-subtle p-3 text-center mt-auto">
        <Link to="/settings" className="text-[12px] text-gray-400 dark:text-v2-muted hover:text-gray-600 dark:hover:text-v2-secondary transition-colors duration-fast">
          Configure alert thresholds →
        </Link>
      </div>
    </div>
  );
}
