export const NARRATIVE_PERCENT_TOLERANCE = 0.1;
export const NARRATIVE_INDEX_TOLERANCE = 0.005;

export interface NarrativeMeasurements {
  percentages: number[];
  indices: Record<"NDVI" | "NDWI" | "NBR", number[]>;
}

export interface NarrativeMismatch {
  kind: "percentage" | "NDVI" | "NDWI" | "NBR";
  value: number;
}

export interface NarrativeFields {
  summary?: unknown;
  fullAnalysis?: unknown;
  recommendations?: unknown;
}

function getNarrativeText(fields: NarrativeFields): string {
  const recommendations = Array.isArray(fields.recommendations)
    ? fields.recommendations.filter((item): item is string => typeof item === "string")
    : [];
  return [
    typeof fields.summary === "string" ? fields.summary : "",
    typeof fields.fullAnalysis === "string" ? fields.fullAnalysis : "",
    ...recommendations,
  ].join("\n");
}

function hasCloseValue(value: number, expected: number[], tolerance: number): boolean {
  return expected.some((measured) => Math.abs(value - measured) <= tolerance);
}

export function checkNarrativeNumbers(
  fields: NarrativeFields,
  measurements: NarrativeMeasurements,
): NarrativeMismatch[] {
  const text = getNarrativeText(fields);
  const mismatches: NarrativeMismatch[] = [];

  for (const match of text.matchAll(/(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*%/g)) {
    const value = Number(match[1].replace(/,/g, ""));
    if (!hasCloseValue(value, measurements.percentages, NARRATIVE_PERCENT_TOLERANCE)) {
      mismatches.push({ kind: "percentage", value });
    }
  }

  const indexPattern = /\b(NDVI|NDWI|NBR)\b[^0-9.!?;\n]{0,80}?(-?\d+\.\d+)(?:\s*(?:in\s+\d{4}\s*)?(?:to|and|,|→)\s*(?:in\s+\d{4}\s*)?(-?\d+\.\d+))?/gi;
  for (const match of text.matchAll(indexPattern)) {
    const kind = match[1].toUpperCase() as keyof NarrativeMeasurements["indices"];
    const expected = measurements.indices[kind];
    for (const rawValue of [match[2], match[3]].filter((value): value is string => value !== undefined)) {
      const value = Number(rawValue);
      if (!hasCloseValue(value, expected, NARRATIVE_INDEX_TOLERANCE)) {
        mismatches.push({ kind, value });
      }
    }
  }

  return mismatches;
}

export function buildDeterministicSummary(
  region: string,
  startDate: string,
  endDate: string,
  measurements: {
    ndviBefore: number;
    ndviAfter: number;
    changePercent: number;
    validPixelRatio: number;
    areaKm2: number;
    nearZeroBaseline: boolean;
  } | null,
): string {
  if (!measurements) {
    return `No measured Sentinel-2 values are available for ${region} from ${startDate} to ${endDate}.`;
  }

  const change = measurements.nearZeroBaseline
    ? `${measurements.changePercent.toFixed(1)} percentage points`
    : `${measurements.changePercent.toFixed(1)}%`;
  return `Measured Sentinel-2 NDVI in ${region} changed from ${measurements.ndviBefore.toFixed(3)} to ${measurements.ndviAfter.toFixed(3)} between ${startDate} and ${endDate} (change: ${change}). The analysis covers ${measurements.areaKm2.toFixed(2)} km2 with ${(measurements.validPixelRatio * 100).toFixed(1)}% valid-pixel coverage.`;
}
