import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Download, Bell, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalysisHistoryRow } from "@/contexts/RightPanelContext";
import { AiPanel } from "./AiPanel";

type Tab = "overview" | "response" | "ai";

function normalizeRecommendation(rec: unknown): string {
  if (typeof rec === "string") return rec;
  if (rec && typeof rec === "object") {
    const r = rec as Record<string, unknown>;
    return String(r.detail ?? r.action ?? JSON.stringify(rec));
  }
  return String(rec);
}

export function AnalysisPanel({ data }: { data: AnalysisHistoryRow }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const payload = data.result_payload || {};
  const analysisMethod = payload.analysisMethod ?? payload.dataProvenance?.analysisMethod;
  const isMeasuredField = (field: string) => {
    const origin = payload.fieldProvenance?.[field]?.origin;
    return origin === "measured"
      || (!origin && ["measured", "real_sentinel_statistics"].includes(analysisMethod));
  };

  const metrics: { label: string; formatted: string; sentiment: "negative" | "warning" | "positive" | "neutral" }[] = [];
  if (isMeasuredField("changePercent") && (typeof payload.changePercent === "number" || typeof payload.change_percent === "number")) {
    const val = payload.changePercent ?? payload.change_percent;
    metrics.push({ label: "Measured change", formatted: `${Number(val).toFixed(1)}%`, sentiment: val > 25 ? "negative" : val > 10 ? "warning" : "positive" });
  }
  if (payload.confidenceLevelOrigin === "model_generated" && typeof payload.confidenceLevel === "number") {
    const val = payload.confidenceLevel;
    metrics.push({
      label: "Model-generated confidence",
      formatted: `${Math.round(val)}%`,
      sentiment: "neutral",
    });
  }
  if (isMeasuredField("area") && payload.area) {
    metrics.push({ label: "AOI area", formatted: String(payload.area), sentiment: "neutral" });
  }
  if (isMeasuredField("severity") && payload.severity) {
    metrics.push({ label: "Severity", formatted: String(payload.severity), sentiment: payload.severity === "critical" || payload.severity === "high" ? "negative" : "neutral" });
  }

  const sentimentColor: Record<string, string> = {
    negative: "text-critical",
    warning: "text-warning",
    positive: "text-stable",
    neutral: "text-gray-900 dark:text-v2-primary",
  };

  const summary = payload.fieldProvenance?.summary?.origin === "model_generated"
    && typeof payload.summary === "string"
    ? payload.summary
    : null;
  const fullAnalysisText: string | undefined =
    payload.fieldProvenance?.fullAnalysis?.origin === "model_generated"
      && typeof payload.fullAnalysis === "string"
      && payload.fullAnalysis !== summary
      ? payload.fullAnalysis
      : undefined;
  const findings: string[] = payload.fieldProvenance?.findings?.origin === "model_generated"
    && Array.isArray(payload.findings)
    ? payload.findings.filter((finding: unknown): finding is string => typeof finding === "string")
    : [];
  const recommendations: string[] = payload.fieldProvenance?.recommendations?.origin === "model_generated"
    && Array.isArray(payload.recommendations)
    ? payload.recommendations.map(normalizeRecommendation)
    : [];
  const hasResponseContent = Boolean(fullAnalysisText) || findings.length > 0 || recommendations.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 dark:border-border-subtle px-3.5 flex-shrink-0">
        {(["overview", "response", "ai"] as Tab[]).map((tab) => (
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
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin p-3.5 space-y-3">
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
              <span className="text-[11px] font-medium text-brand">Model-generated summary</span>
            </div>
            {summary ? (
              <p className="text-[13px] text-gray-700 dark:text-v2-secondary leading-relaxed">{summary}</p>
            ) : (
              <p className="text-[13px] text-gray-400 dark:text-v2-muted">No provenance-tagged summary is available for this analysis.</p>
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
              onClick={() => navigate("/early-warning")}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] text-white bg-brand rounded-md hover:bg-blue-500 transition-all duration-fast"
            >
              <Bell className="w-3.5 h-3.5" /> Set alert
            </button>
          </div>
        </div>
      )}

      {activeTab === "response" && (
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin p-3.5 space-y-4">
          {fullAnalysisText && (
            <div>
              <p className="text-[11px] text-gray-400 dark:text-v2-muted mb-1.5">Model-generated detailed analysis</p>
              <div className="text-[13px] leading-relaxed bg-gray-50 dark:bg-surface-2 border border-gray-200 dark:border-border-subtle p-3 rounded-lg text-gray-700 dark:text-v2-secondary">
                {fullAnalysisText}
              </div>
            </div>
          )}

          {findings.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-gray-900 dark:text-v2-primary mb-2 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5 text-brand" /> Model-generated findings
              </p>
              <div className="space-y-2">
                {findings.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand mt-1.5 flex-shrink-0" />
                    <p className="text-[13px] text-gray-700 dark:text-v2-secondary leading-relaxed">{f}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recommendations.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-gray-900 dark:text-v2-primary mb-2">Model-generated recommendations</p>
              <div className="space-y-2">
                {recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand mt-1.5 flex-shrink-0" />
                    <p className="text-[13px] text-gray-700 dark:text-v2-secondary leading-relaxed">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasResponseContent && (
            <p className="text-[13px] text-gray-400 dark:text-v2-muted">No additional response details were recorded for this analysis.</p>
          )}
        </div>
      )}

      {activeTab === "ai" && <AiPanel />}
    </div>
  );
}
