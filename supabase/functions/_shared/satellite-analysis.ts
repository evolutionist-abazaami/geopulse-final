import {
  AOI_HALF_WIDTH_DEGREES,
  MAX_ANALYSIS_WINDOW_DAYS,
  NDVI_SEVERITY_THRESHOLDS,
  SENTINEL_2_SENSOR,
  STATISTICS_GRID_SIZE,
  TREND_SLOPE_DEADBAND_PERCENT_PER_MONTH,
  NEAR_ZERO_NDVI_BASELINE,
} from "./analysis-constants.ts";
import type { Origin } from "./analysis-constants.ts";

export type AnalysisMethod = "measured" | "model_only";

export type FieldProvenance = {
  origin: Origin;
  source: string;
  sensor: string;
  method: AnalysisMethod;
  dateRange: string;
};

export interface SpectralBandStats {
  mean: number;
  min: number;
  max: number;
}

export interface SatelliteNumericFields {
  area: string | null;
  changePercent: number | null;
  spectralIndices: Record<string, SpectralBandStats> | null;
  temporalBreakdown: { label: string; changePercent: number; months: number }[] | null;
  predictiveModeling: {
    trend_direction: "improving" | "stable" | "declining";
    projected_change_6mo: number;
    projected_change_12mo: number;
    confidence: number | null;
    methodology: string;
  } | null;
}

export interface AnalysisWindows {
  studyStart: Date;
  studyEnd: Date;
  beforeTo: Date;
  afterFrom: Date;
  windowLengthDays: number;
}

const MODEL_GENERATED_FIELDS = new Set([
  "summary",
  "fullAnalysis",
  "recommendations",
  "severity",
  "classificationResults",
  "changeDetection",
  "multiEventAnalysis",
  "methodologyTransparency",
]);

const MEASURED_FIELDS = new Set([
  "area",
  "changePercent",
  "temporalBreakdown",
  "cloudCoverage",
  "dataQuality",
  "spectralIndices",
  "predictiveModeling",
]);

export function attachFieldProvenance<T extends Record<string, unknown>>(
  result: T,
  method: AnalysisMethod,
  startDate: string,
  endDate: string,
  generatedNarrative = true,
  sensorName = SENTINEL_2_SENSOR,
): T & { fieldProvenance: Record<string, FieldProvenance> } {
  const dateRange = `${startDate}/${endDate}`;
  const fieldProvenance: Record<string, FieldProvenance> = {};

  for (const [field, value] of Object.entries(result)) {
    let origin: Origin = "unavailable";
    let source = "Not available";
    let sensor = "Not applicable";

    if (field === "coordinates" && value !== null) {
      origin = "geocoded";
      source = "Request coordinates";
    } else if (field === "narrativeGuard") {
      source = "Programmatic numeric validation";
    } else if (field === "severity" && method === "measured" && value !== null) {
      origin = "measured";
      source = "NDVI change thresholds";
      sensor = sensorName;
    } else if (generatedNarrative && MODEL_GENERATED_FIELDS.has(field) && value !== null) {
      origin = "model_generated";
      source = "Groq-generated narrative";
      sensor = sensorName;
    } else if (method === "measured" && MEASURED_FIELDS.has(field) && value !== null) {
      origin = "measured";
      source = "Satellite statistics API";
      sensor = sensorName;
    }

    fieldProvenance[field] = { origin, source, sensor, method, dateRange };
  }

  fieldProvenance.fieldProvenance = {
    origin: "unavailable",
    source: "Generated provenance metadata",
    sensor: "Not applicable",
    method,
    dateRange,
  };
  return { ...result, fieldProvenance };
}

export function normalizeNumericFields(
  method: AnalysisMethod,
  fields: SatelliteNumericFields,
): SatelliteNumericFields {
  if (method === "measured") return fields;
  return {
    area: null,
    changePercent: null,
    spectralIndices: null,
    temporalBreakdown: null,
    predictiveModeling: null,
  };
}

export function deriveSeverity(changePercent: number): "low" | "medium" | "high" | "critical" {
  const magnitude = Math.abs(changePercent);
  if (magnitude >= NDVI_SEVERITY_THRESHOLDS.critical) return "critical";
  if (magnitude >= NDVI_SEVERITY_THRESHOLDS.high) return "high";
  if (magnitude >= NDVI_SEVERITY_THRESHOLDS.medium) return "medium";
  return "low";
}

export function calculateChangePercent(baseline: number, current: number): number {
  const delta = current - baseline;
  return Math.abs(baseline) > NEAR_ZERO_NDVI_BASELINE
    ? (delta / Math.abs(baseline)) * 100
    : delta * 100;
}

export function deriveTrendDirection(slopePercentPerMonth: number): "improving" | "stable" | "declining" {
  if (slopePercentPerMonth > TREND_SLOPE_DEADBAND_PERCENT_PER_MONTH) return "improving";
  if (slopePercentPerMonth < -TREND_SLOPE_DEADBAND_PERCENT_PER_MONTH) return "declining";
  return "stable";
}

export function createAnalysisWindows(
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): AnalysisWindows | null {
  const studyStart = new Date(startDate);
  const studyEnd = new Date(Math.min(new Date(endDate).getTime(), now.getTime()));
  if (studyEnd.getTime() <= studyStart.getTime()) return null;

  const totalMs = studyEnd.getTime() - studyStart.getTime();
  const midpoint = new Date(studyStart.getTime() + totalMs / 2);
  const maxWindowMs = MAX_ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const beforeTo = new Date(Math.min(midpoint.getTime(), studyStart.getTime() + maxWindowMs));
  const afterFrom = new Date(Math.max(midpoint.getTime(), studyEnd.getTime() - maxWindowMs));

  return {
    studyStart,
    studyEnd,
    beforeTo,
    afterFrom,
    windowLengthDays: Math.ceil(totalMs / (24 * 60 * 60 * 1000)),
  };
}
