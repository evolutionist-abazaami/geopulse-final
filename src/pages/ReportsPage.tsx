import { useState } from "react";
import { Download, FileText, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReportGenerator from "@/components/ReportGenerator";
import { useAnalysisHistory } from "@/hooks/useAnalysisHistory";

const typePillStyles: Record<string, string> = {
  geowitness: "bg-brand-dim text-brand",
  geosearch: "bg-event-search/15 text-event-search",
};

// Ported verbatim from the old Dashboard.tsx page's bulk export.
function exportToJSON(data: any[], filename: string) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("JSON file downloaded successfully");
}

export default function ReportsPage() {
  const { rows, isLoading } = useAnalysisHistory();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-gray-50 dark:bg-surface-base p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900 dark:text-v2-primary">Reports</h1>
          <p className="text-[14px] text-gray-500 dark:text-v2-muted mt-1">Export your analyses as PDF, GeoJSON, or CSV</p>
        </div>
        <button
          onClick={() => exportToJSON(rows, "geopulse_history")}
          disabled={rows.length === 0}
          className={cn(
            "flex items-center gap-2 px-4 py-2 bg-brand text-white text-[13px] font-medium rounded-md",
            "hover:bg-blue-500 disabled:opacity-50 transition-all duration-fast"
          )}
        >
          <Download className="w-4 h-4" /> Export all (JSON)
        </button>
      </div>

      <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead>
              <tr className="bg-gray-50 dark:bg-surface-2 border-b border-gray-200 dark:border-border-subtle">
                {[
                  ["Region", "w-2/5"],
                  ["Type", "w-1/5"],
                  ["Date", "w-1/5"],
                  ["", "w-1/5"],
                ].map(([col, width]) => (
                  <th key={col || "action"} className={cn("text-left text-[11px] text-gray-400 dark:text-v2-muted uppercase tracking-[0.06em] px-4 py-2.5 font-medium", width)}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const centerLat = (row.region_bounds.north + row.region_bounds.south) / 2;
                const centerLng = (row.region_bounds.east + row.region_bounds.west) / 2;
                const isExpanded = expandedId === row.id;
                return (
                  <>
                    <tr
                      key={row.id}
                      className="border-b border-gray-200 dark:border-border-subtle transition-colors duration-fast hover:bg-gray-50 dark:hover:bg-surface-2"
                    >
                      <td className="px-4 py-3 text-[13px] text-gray-900 dark:text-v2-primary truncate">{row.region_name}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full capitalize", typePillStyles[row.type])}>
                          {row.event_type ? row.event_type.replace(/_/g, " ") : row.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-gray-400 dark:text-v2-muted">{new Date(row.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] rounded-md transition-all duration-fast ml-auto",
                            isExpanded
                              ? "text-brand bg-brand-dim"
                              : "text-gray-600 dark:text-v2-secondary bg-gray-100 dark:bg-surface-2 hover:text-gray-900 dark:hover:text-v2-primary"
                          )}
                        >
                          Generate report
                          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-fast", isExpanded && "rotate-180")} />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-gray-200 dark:border-border-subtle bg-gray-50 dark:bg-surface-2">
                        <td colSpan={4} className="px-4 py-4">
                          <ReportGenerator
                            analysisData={row.result_payload}
                            eventType={row.event_type || undefined}
                            region={row.region_name}
                            lat={centerLat}
                            lng={centerLng}
                            onCaptureMap={() => Promise.resolve(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {!isLoading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-10 h-10 text-gray-300 dark:text-v2-disabled mb-3" />
            <p className="text-[14px] text-gray-700 dark:text-v2-secondary font-medium">No reports generated</p>
            <p className="text-[13px] text-gray-400 dark:text-v2-muted mt-1">Run an analysis and export it to create a report</p>
          </div>
        )}
      </div>
    </div>
  );
}
