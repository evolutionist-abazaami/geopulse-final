import { useState } from "react";
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Sparkles, Download, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { AnalysisHistoryRow } from "@/contexts/RightPanelContext";
import { AiPanel } from "./AiPanel";

type Tab = "overview" | "trend" | "ai";

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export function AnalysisPanel({ data }: { data: AnalysisHistoryRow }) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const payload = data.result_payload || {};

  const metrics: { label: string; formatted: string; sentiment: "negative" | "warning" | "positive" | "neutral" }[] = [];
  if (typeof payload.changePercent === "number" || typeof payload.change_percent === "number") {
    const val = payload.changePercent ?? payload.change_percent;
    metrics.push({ label: "Change", formatted: `${Number(val).toFixed(1)}%`, sentiment: val > 25 ? "negative" : val > 10 ? "warning" : "positive" });
  }
  if (typeof payload.analysisConfidence === "number" || typeof payload.confidenceLevel === "number") {
    const val = payload.analysisConfidence ?? payload.confidenceLevel;
    metrics.push({ label: "Confidence", formatted: `${Math.round(val)}%`, sentiment: "neutral" });
  }
  if (payload.area) {
    metrics.push({ label: "Area", formatted: String(payload.area), sentiment: "neutral" });
  }
  if (payload.severity) {
    metrics.push({ label: "Severity", formatted: String(payload.severity), sentiment: payload.severity === "critical" || payload.severity === "high" ? "negative" : "neutral" });
  }

  const sentimentColor: Record<string, string> = {
    negative: "text-critical",
    warning: "text-warning",
    positive: "text-stable",
    neutral: "text-v2-primary",
  };

  const timeSeries = Array.isArray(payload.temporalBreakdown)
    ? payload.temporalBreakdown.map((p: any) => ({ date: p.label, value: p.changePercent }))
    : [];

  const summary = payload.summary || payload.interpretation || payload.fullAnalysis;

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 dark:border-border-subtle px-3.5 flex-shrink-0">
        {(["overview", "trend", "ai"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "text-[12px] py-2.5 mr-4 border-b-2 transition-all duration-fast capitalize",
              activeTab === tab
                ? "text-brand border-brand"
                : "text-gray-400 dark:text-v2-muted border-transparent hover:text-gray-600 dark:hover:text-v2-secondary"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3.5 space-y-3">
          {payload.beforeImageUrl && payload.afterImageUrl ? (
            <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-border-subtle">
              <ReactCompareSlider
                itemOne={<ReactCompareSliderImage src={payload.beforeImageUrl} alt="Before" style={{ height: 140, objectFit: "cover" }} />}
                itemTwo={<ReactCompareSliderImage src={payload.afterImageUrl} alt="After" style={{ height: 140, objectFit: "cover" }} />}
              />
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-border-subtle">
              <div className="h-[68px] bg-gray-100 dark:bg-surface-2 flex items-center justify-center">
                <span className="text-[11px] text-gray-400 dark:text-v2-muted">Before · {formatDate(data.date_range?.start)}</span>
              </div>
              <div className="h-px bg-gray-200 dark:bg-border-default" />
              <div className="h-[68px] bg-gray-100 dark:bg-surface-3 flex items-center justify-center">
                <span className="text-[11px] text-gray-400 dark:text-v2-muted">After · {formatDate(data.date_range?.end)}</span>
              </div>
            </div>
          )}

          {metrics.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {metrics.map(({ label, formatted, sentiment }) => (
                <div key={label} className="bg-gray-50 dark:bg-surface-2 border border-gray-200 dark:border-border-subtle rounded-md p-2.5">
                  <p className="text-[11px] text-gray-400 dark:text-v2-muted mb-1">{label}</p>
                  <p className={cn("text-[20px] font-semibold", sentimentColor[sentiment])}>{formatted}</p>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-md border border-brand-border bg-brand-dim/30 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-brand" />
              <span className="text-[11px] font-medium text-brand">AI interpretation</span>
            </div>
            {summary ? (
              <p className="text-[13px] text-gray-700 dark:text-v2-secondary leading-relaxed">{summary}</p>
            ) : (
              <p className="text-[13px] text-gray-400 dark:text-v2-muted">No summary available for this analysis.</p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `geopulse-${data.region_name.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] text-gray-600 dark:text-v2-secondary bg-gray-50 dark:bg-surface-2 border border-gray-200 dark:border-border-default rounded-md hover:border-gray-300 dark:hover:border-border-strong hover:text-gray-900 dark:hover:text-v2-primary transition-all duration-fast"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button
              onClick={() => toast.info("Configure alert thresholds from Settings.")}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] text-white bg-brand rounded-md hover:bg-blue-500 transition-all duration-fast"
            >
              <Bell className="w-3.5 h-3.5" /> Set alert
            </button>
          </div>
        </div>
      )}

      {activeTab === "trend" && (
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3.5">
          <p className="text-[12px] text-gray-400 dark:text-v2-muted mb-3">Historical trend</p>
          {timeSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[13px] text-gray-400 dark:text-v2-muted">No trend data available for this analysis.</p>
          )}
        </div>
      )}

      {activeTab === "ai" && <AiPanel />}
    </div>
  );
}
