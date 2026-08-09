import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Map as MapIcon, Satellite, Shield, Bell, FileText, Settings,
  ChevronLeft, ChevronRight, Clock, TreePine, Droplets, Flame, Sun, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useMapContext } from "@/contexts/MapContext";
import { useRightPanel } from "@/contexts/RightPanelContext";
import { useAnalysisHistory } from "@/hooks/useAnalysisHistory";
import type { AnalysisHistoryRow } from "@/contexts/RightPanelContext";
import geopulseLogo from "@/assets/geopulse-logo.png";

const COLLAPSE_KEY = "geopulse-sidebar-collapsed";

const eventTypeStyles: Record<string, { bg: string; icon: string; Icon: typeof TreePine }> = {
  deforestation: { bg: "bg-event-deforestation/15", icon: "text-event-deforestation", Icon: TreePine },
  flood: { bg: "bg-event-flood/15", icon: "text-event-flood", Icon: Droplets },
  wildfire: { bg: "bg-event-wildfire/15", icon: "text-event-wildfire", Icon: Flame },
  drought: { bg: "bg-event-drought/15", icon: "text-event-drought", Icon: Sun },
  geosearch: { bg: "bg-event-search/15", icon: "text-event-search", Icon: Search },
};

function styleFor(row: AnalysisHistoryRow) {
  return eventTypeStyles[row.event_type || ""] || eventTypeStyles[row.type === "geosearch" ? "geosearch" : "deforestation"];
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const mapCtx = useMapContext();
  const rightPanel = useRightPanel();
  const { groups, isLoading, selectedId, setSelectedId } = useAnalysisHistory();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === "true";
  });
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { count } = await supabase
        .from("hazard_alerts")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false)
        .eq("is_resolved", false);
      setAlertCount(count || 0);
    };
    load();

    const channel = supabase
      .channel("sidebar-hazard-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "hazard_alerts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  };

  const navItems = [
    { label: "Map", icon: MapIcon, onClick: () => { rightPanel.close(); navigate("/"); }, active: location.pathname === "/" && !rightPanel.mode },
    { label: "GeoWitness", icon: Satellite, onClick: () => { navigate("/"); rightPanel.open({ type: "geowitness" }); mapCtx.setSelectionMode(true); }, active: rightPanel.mode?.type === "geowitness" },
    { label: "Early Warning", icon: Shield, onClick: () => navigate("/early-warning"), active: location.pathname === "/early-warning" },
    { label: "Alerts", icon: Bell, onClick: () => rightPanel.open({ type: "alerts" }), active: rightPanel.mode?.type === "alerts", badgeCount: alertCount },
    { label: "Reports", icon: FileText, onClick: () => navigate("/reports"), active: location.pathname === "/reports" },
    { label: "Settings", icon: Settings, onClick: () => navigate("/settings"), active: location.pathname === "/settings" },
  ];

  const openHistoryItem = (row: AnalysisHistoryRow) => {
    setSelectedId(row.id);
    rightPanel.open({ type: "analysis", data: row });
    mapCtx.flyToBounds(row.region_bounds);
    mapCtx.highlightRegion(row.region_bounds);
    if (location.pathname !== "/") navigate("/");
  };

  const totalCount = groups.today.length + groups.yesterday.length + groups.thisWeek.length + groups.older.length;

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-white dark:bg-surface-1 border-r border-gray-200 dark:border-border-subtle",
        "transition-[width] duration-base ease-smooth overflow-hidden flex-shrink-0",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      <div className="flex items-center h-12 px-3 border-b border-gray-200 dark:border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <img src={geopulseLogo} className="w-7 h-7 flex-shrink-0 rounded-full" alt="" />
          {!collapsed && <span className="text-[15px] font-semibold text-gray-900 dark:text-v2-primary whitespace-nowrap">GeoPulse</span>}
        </div>
      </div>

      <nav className="px-2 pt-3 pb-2 flex-shrink-0">
        {!collapsed && (
          <p className="text-[10px] text-gray-400 dark:text-v2-muted uppercase tracking-[0.08em] px-2 mb-2">Workspace</p>
        )}
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={item.onClick}
            title={item.label}
            className={cn(
              "flex items-center w-full gap-2.5 px-2.5 py-2 rounded-md text-[13px] mb-0.5",
              "transition-all duration-fast",
              collapsed && "justify-center",
              item.active
                ? "bg-brand-dim text-brand border border-brand-border"
                : "text-gray-600 dark:text-v2-secondary hover:bg-gray-100 dark:hover:bg-surface-3 hover:text-gray-900 dark:hover:text-v2-primary border border-transparent"
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
            {!collapsed && !!item.badgeCount && (
              <span className="min-w-[18px] h-[18px] text-[10px] font-medium bg-critical text-white rounded-full flex items-center justify-center px-1">
                {item.badgeCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <div className="flex flex-col flex-1 overflow-hidden px-2 pb-2">
          <p className="text-[10px] text-gray-400 dark:text-v2-muted uppercase tracking-[0.08em] px-2 py-2 flex-shrink-0">Analysis history</p>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2 p-2">
                  <div className="skeleton w-7 h-7 rounded-md flex-shrink-0" />
                  <div className="flex-1 space-y-1.5 pt-0.5">
                    <div className="skeleton h-3 rounded w-4/5" />
                    <div className="skeleton h-2.5 rounded w-2/5" />
                  </div>
                </div>
              ))
            ) : totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
                <Clock className="w-8 h-8 text-gray-300 dark:text-v2-disabled mb-3" />
                <p className="text-[12px] text-gray-400 dark:text-v2-muted">No analyses yet</p>
                <p className="text-[11px] text-gray-300 dark:text-v2-disabled mt-1">Run GeoWitness or search to get started</p>
              </div>
            ) : (
              (["Today", "Yesterday", "This week", "Older"] as const).map((label, i) => {
                const items = [groups.today, groups.yesterday, groups.thisWeek, groups.older][i];
                if (items.length === 0) return null;
                return (
                  <div key={label} className="mb-2">
                    <p className="text-[10px] text-gray-400 dark:text-v2-muted px-2 py-1">{label}</p>
                    {items.map((row) => {
                      const { bg, icon, Icon } = styleFor(row);
                      return (
                        <button
                          key={row.id}
                          onClick={() => openHistoryItem(row)}
                          className={cn(
                            "flex items-start gap-2 w-full p-2 rounded-md text-left",
                            "transition-all duration-fast",
                            selectedId === row.id
                              ? "bg-gray-100 dark:bg-surface-3 border-l-2 border-brand pl-1.5"
                              : "hover:bg-gray-50 dark:hover:bg-surface-2 border-l-2 border-transparent"
                          )}
                        >
                          <div className={cn("w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5", bg)}>
                            <Icon className={cn("w-3.5 h-3.5", icon)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-gray-900 dark:text-v2-primary truncate">{row.region_name}</p>
                            <p className="text-[11px] text-gray-400 dark:text-v2-muted">
                              {row.type === "geowitness" ? (row.event_type || "analysis").replace(/_/g, " ") : "search"} · {timeAgo(row.created_at)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <button
        onClick={toggleCollapse}
        className="flex items-center justify-center h-10 border-t border-gray-200 dark:border-border-subtle text-gray-400 dark:text-v2-muted hover:text-gray-900 dark:hover:text-v2-primary hover:bg-gray-50 dark:hover:bg-surface-2 transition-all duration-fast flex-shrink-0"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}
