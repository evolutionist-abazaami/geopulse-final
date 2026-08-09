import { useCallback, useEffect, useState } from "react";
import { isToday, isYesterday, isThisWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { AnalysisHistoryRow } from "@/contexts/RightPanelContext";
import type { RegionBounds } from "@/contexts/MapContext";

export interface SaveAnalysisInput {
  type: "geowitness" | "geosearch";
  eventType?: string | null;
  regionName: string;
  regionBounds: RegionBounds;
  dateRange?: { start: string; end: string } | null;
  resultPayload: any;
}

export function useAnalysisHistory() {
  const [rows, setRows] = useState<AnalysisHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setRows([]);
      setIsLoading(false);
      return;
    }
    const { data } = await supabase
      .from("analysis_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data as unknown as AnalysisHistoryRow[]) || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Each screen (Sidebar, GeoWitnessPanel, TopBar's search save, ReportsPage)
  // mounts its own instance of this hook with independent state. Without
  // this subscription, running an analysis in one instance wouldn't show up
  // in the Sidebar's history list until it happened to reload. Realtime
  // keeps every instance in sync the same way AlertsPanel/AlertMarkers
  // already do for hazard_alerts.
  useEffect(() => {
    let cancelled = false;
    let userId: string | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return;
      userId = user?.id ?? null;
    });

    const channel = supabase
      .channel(`analysis-history-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "analysis_history" },
        (payload) => {
          const row = payload.new as AnalysisHistoryRow;
          if (userId && row.user_id !== userId) return;
          setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [row, ...prev]));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const saveAnalysis = useCallback(async (input: SaveAnalysisInput) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("analysis_history")
      .insert({
        user_id: user.id,
        type: input.type,
        event_type: input.eventType ?? null,
        region_name: input.regionName,
        region_bounds: input.regionBounds as any,
        date_range: (input.dateRange ?? null) as any,
        result_payload: input.resultPayload,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to save analysis history:", error);
      return null;
    }
    const row = data as unknown as AnalysisHistoryRow;
    setRows((prev) => [row, ...prev]);
    return row;
  }, []);

  const groups = {
    today: rows.filter((r) => isToday(new Date(r.created_at))),
    yesterday: rows.filter((r) => isYesterday(new Date(r.created_at))),
    thisWeek: rows.filter((r) => {
      const d = new Date(r.created_at);
      return !isToday(d) && !isYesterday(d) && isThisWeek(d);
    }),
    older: rows.filter((r) => {
      const d = new Date(r.created_at);
      return !isToday(d) && !isYesterday(d) && !isThisWeek(d);
    }),
  };

  return { rows, groups, isLoading, saveAnalysis, selectedId, setSelectedId, reload: load };
}
