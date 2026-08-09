import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useRightPanel } from "@/contexts/RightPanelContext";
import { AnalysisPanel } from "@/components/panel/AnalysisPanel";
import { SearchPanel } from "@/components/panel/SearchPanel";
import { AiPanel } from "@/components/panel/AiPanel";
import { GeoWitnessPanel } from "@/components/panel/GeoWitnessPanel";

const PANEL_TITLE: Record<string, string> = {
  analysis: "Analysis",
  search: "Search results",
  ai: "AI Assistant",
  geowitness: "GeoWitness",
};

export function RightPanel() {
  const { mode, close } = useRightPanel();

  return (
    <AnimatePresence>
      {mode && (
        <motion.aside
          initial={{ x: 380, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 380, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="w-[380px] flex-shrink-0 flex flex-col bg-white dark:bg-surface-1 border-l border-gray-200 dark:border-border-subtle overflow-hidden"
        >
          <div className="flex items-start justify-between px-3.5 py-3 border-b border-gray-200 dark:border-border-subtle flex-shrink-0">
            <div>
              <p className="text-[13px] font-medium text-gray-900 dark:text-v2-primary">{PANEL_TITLE[mode.type]}</p>
              {mode.type === "analysis" && (
                <p className="text-[11px] text-gray-400 dark:text-v2-muted mt-0.5">{mode.data.region_name}</p>
              )}
            </div>
            <button
              onClick={close}
              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 dark:text-v2-muted hover:text-gray-900 dark:hover:text-v2-primary hover:bg-gray-100 dark:hover:bg-surface-2 transition-all duration-fast mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {mode.type === "analysis" && <AnalysisPanel data={mode.data} />}
            {mode.type === "search" && <SearchPanel data={mode.data} />}
            {mode.type === "ai" && <AiPanel />}
            {mode.type === "geowitness" && <GeoWitnessPanel />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
