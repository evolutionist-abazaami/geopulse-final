import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function MapHUD() {
  const [totalAnalyses, setTotalAnalyses] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [monitoredRegions, setMonitoredRegions] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [historyRes, alertsRes] = await Promise.all([
        supabase.from("analysis_history").select("region_name").eq("user_id", user.id),
        supabase.from("hazard_alerts").select("id", { count: "exact", head: true }).eq("is_resolved", false),
      ]);

      if (cancelled) return;
      const rows = historyRes.data || [];
      setTotalAnalyses(rows.length);
      setMonitoredRegions(new Set(rows.map((r) => r.region_name)).size);
      setActiveAlerts(alertsRes.count || 0);
    };
    load();

    return () => { cancelled = true; };
  }, []);

  const stats = [
    { label: "Analyses", value: totalAnalyses },
    { label: "Alerts", value: activeAlerts },
    { label: "Regions", value: monitoredRegions },
  ];

  return (
    <div className="absolute bottom-3 right-3 z-10 glass border border-border-subtle rounded-lg px-4 py-2.5 flex gap-5">
      {stats.map(({ label, value }) => (
        <div key={label} className="text-center">
          <p className="text-[18px] font-semibold text-v2-primary leading-none">{value}</p>
          <p className="text-[10px] text-v2-muted mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}
