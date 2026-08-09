import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { RegionBounds } from "./MapContext";

export interface AnalysisHistoryRow {
  id: string;
  user_id: string;
  type: "geowitness" | "geosearch";
  event_type: string | null;
  region_name: string;
  region_bounds: RegionBounds;
  date_range: { start: string; end: string } | null;
  result_payload: any;
  created_at: string;
}

export interface GeoSearchResult {
  query: string;
  interpretation: string;
  findings: string[];
  locations: { name: string; lat: number; lng: number; verified?: boolean }[];
  confidenceLevel: number;
  recommendations: string[];
  reportLocation?: { lat: number; lng: number; name: string; verified: boolean } | null;
}

export type RightPanelMode =
  | { type: "analysis"; data: AnalysisHistoryRow }
  | { type: "alerts" }
  | { type: "search"; data: GeoSearchResult }
  | { type: "ai" }
  | { type: "geowitness" }
  | null;

interface RightPanelContextValue {
  mode: RightPanelMode;
  open: (mode: NonNullable<RightPanelMode>) => void;
  close: () => void;
}

const RightPanelContext = createContext<RightPanelContextValue | null>(null);

export function RightPanelProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<RightPanelMode>(null);

  const open = useCallback((next: NonNullable<RightPanelMode>) => setMode(next), []);
  const close = useCallback(() => setMode(null), []);

  const value = useMemo<RightPanelContextValue>(() => ({ mode, open, close }), [mode, open, close]);

  return <RightPanelContext.Provider value={value}>{children}</RightPanelContext.Provider>;
}

export function useRightPanel() {
  const ctx = useContext(RightPanelContext);
  if (!ctx) throw new Error("useRightPanel must be used within a RightPanelProvider");
  return ctx;
}
