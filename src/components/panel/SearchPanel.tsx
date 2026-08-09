import { MapPin, Satellite } from "lucide-react";
import { cn } from "@/lib/utils";
import ReportGenerator from "@/components/ReportGenerator";
import { useMapContext } from "@/contexts/MapContext";
import { useRightPanel } from "@/contexts/RightPanelContext";
import type { GeoSearchResult } from "@/contexts/RightPanelContext";

export function SearchPanel({ data }: { data: GeoSearchResult }) {
  const mapCtx = useMapContext();
  const rightPanel = useRightPanel();
  const firstLocation = data.locations?.[0];

  return (
    <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin p-3.5 space-y-3">
      <div>
        <p className="text-[18px] font-semibold text-gray-900 dark:text-v2-primary leading-snug">
          {firstLocation?.name || data.reportLocation?.name || "Search result"}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-gray-400 dark:text-v2-muted">Confidence</span>
          <span className="text-[11px] font-medium text-gray-900 dark:text-v2-primary">{data.confidenceLevel}%</span>
        </div>
        <div className="h-1 bg-gray-200 dark:bg-surface-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all duration-slow"
            style={{ width: `${Math.max(0, Math.min(100, data.confidenceLevel))}%` }}
          />
        </div>
      </div>

      {data.reportLocation && (
        <div className="flex items-center gap-1.5 text-xs">
          <MapPin className="h-3 w-3 text-gray-400 dark:text-v2-muted" />
          <span className="text-gray-500 dark:text-v2-muted">{data.reportLocation.name}</span>
          {data.reportLocation.verified ? (
            <span className="px-1.5 py-0.5 rounded-full bg-stable-dim text-stable font-medium">Verified location</span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full bg-warning-dim text-warning font-medium">Estimated location</span>
          )}
        </div>
      )}

      <p className="text-[13px] text-gray-700 dark:text-v2-secondary leading-relaxed">{data.interpretation}</p>

      {data.findings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-gray-900 dark:text-v2-primary">Findings</p>
          {data.findings.map((finding, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-brand mt-1.5 flex-shrink-0" />
              <p className="text-[13px] text-gray-600 dark:text-v2-secondary">{finding}</p>
            </div>
          ))}
        </div>
      )}

      {data.recommendations.length > 0 && (
        <div className="space-y-1">
          <p className="text-[12px] font-medium text-gray-900 dark:text-v2-primary">Recommendations</p>
          {data.recommendations.map((rec, i) => (
            <p key={i} className="text-[12px] text-gray-500 dark:text-v2-muted">• {rec}</p>
          ))}
        </div>
      )}

      <ReportGenerator
        analysisData={data}
        region={data.reportLocation?.name || firstLocation?.name}
        lat={data.reportLocation?.lat}
        lng={data.reportLocation?.lng}
        onCaptureMap={() => mapCtx.captureSnapshot()}
      />

      <button
        onClick={() => rightPanel.open({ type: "geowitness" })}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2.5 bg-brand text-white text-[13px] font-medium rounded-md",
          "hover:bg-blue-500 transition-all duration-fast"
        )}
      >
        <Satellite className="w-4 h-4" />
        Analyze with GeoWitness
      </button>
    </div>
  );
}
