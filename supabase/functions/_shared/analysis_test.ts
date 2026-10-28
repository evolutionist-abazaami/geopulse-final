import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  attachFieldProvenance,
  calculateChangePercent,
  createAnalysisWindows,
  deriveSeverity,
  normalizeNumericFields,
} from "./satellite-analysis.ts";
import { checkNarrativeNumbers } from "./narrative-guard.ts";
import { determineHazardSeverity } from "./hazard-severity.ts";
import { groqChatCompletion } from "./groq-client.ts";
import { fetchSpectralStatistics } from "./sentinel-statistics.ts";

Deno.test("every analysis result field has a provenance entry", () => {
  const result = {
    analysisMethod: "measured",
    summary: "Measured change",
    changePercent: 12,
    coordinates: { lat: 5, lng: -1 },
  };
  const withProvenance = attachFieldProvenance(result, "measured", "2024-01-01", "2024-12-31");

  assertEquals(
    Object.keys(withProvenance.fieldProvenance).sort(),
    [...Object.keys(result), "fieldProvenance"].sort(),
  );
  assert(Object.values(withProvenance.fieldProvenance).every((entry) => typeof entry.origin === "string"));
});

Deno.test("model-only analysis always nulls numeric satellite fields", () => {
  assertEquals(
    normalizeNumericFields("model_only", {
      area: "12 km2",
      changePercent: 15,
      spectralIndices: { ndvi: { mean: 0.5, min: 0.2, max: 0.8 } },
      temporalBreakdown: [{ label: "Jan", changePercent: 2, months: 1 }],
      predictiveModeling: {
        trend_direction: "improving",
        projected_change_6mo: 2,
        projected_change_12mo: 4,
        confidence: 90,
        methodology: "model",
      },
    }),
    {
      area: null,
      changePercent: null,
      spectralIndices: null,
      temporalBreakdown: null,
      predictiveModeling: null,
    },
  );
});

Deno.test("severity is derived from the exported measured-change thresholds", () => {
  assertEquals(deriveSeverity(2.9), "low");
  assertEquals(deriveSeverity(3), "medium");
  assertEquals(deriveSeverity(-8), "high");
  assertEquals(deriveSeverity(15), "critical");
});

Deno.test("change percentage uses relative change except for near-zero baselines", () => {
  assert(Math.abs(calculateChangePercent(0.2, 0.3) - 50) < 1e-10);
  assertEquals(calculateChangePercent(0.05, 0.1), 5);
  assertEquals(calculateChangePercent(0, 0.1), 10);
});

Deno.test("analysis windows cap each side at 90 days and exclude future dates", () => {
  const now = new Date("2025-01-01T00:00:00.000Z");
  const windows = createAnalysisWindows("2023-01-01", "2025-06-01", now);
  assert(windows);
  assertEquals(windows.studyEnd.toISOString(), now.toISOString());
  assert(windows.beforeTo.getTime() <= windows.studyStart.getTime() + 90 * 86_400_000);
  assert(windows.afterFrom.getTime() >= windows.studyEnd.getTime() - 90 * 86_400_000);
  assert(windows.beforeTo.getTime() <= windows.afterFrom.getTime());

  const futureOnly = createAnalysisWindows("2025-02-01", "2025-03-01", now);
  assertEquals(futureOnly, null);
});

Deno.test("narrative numeric guard accepts measured values and detects mismatches", () => {
  const measurements = {
    percentages: [21.4, 80],
    indices: { NDVI: [0.42, 0.51], NDWI: [], NBR: [] },
  };
  assertEquals(
    checkNarrativeNumbers({
      summary: "NDVI changed from 0.420 to 0.510, a 21.4% change with 80.0% valid-pixel coverage.",
      fullAnalysis: "The measured NDVI values are 0.42 and 0.51.",
      recommendations: ["Maintain the current monitoring plan."],
    }, measurements),
    [],
  );

  assertEquals(
    checkNarrativeNumbers({
      summary: "NDVI changed from 0.600 to 0.510, a 99% change.",
      fullAnalysis: "",
      recommendations: [],
    }, measurements).length,
    2,
  );
});

Deno.test("hazard severity uses documented ratio boundaries", () => {
  assertEquals(determineHazardSeverity(130, 100), "low");
  assertEquals(determineHazardSeverity(131, 100), "moderate");
  assertEquals(determineHazardSeverity(176, 100), "high");
  assertEquals(determineHazardSeverity(251, 100), "critical");
});

Deno.test("Sentinel Hub statistics are parsed from a mocked API response", async () => {
  let requestedUrl = "";
  const mockFetch: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    assertEquals(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assertEquals(body.aggregation.width, 128);
    assertEquals(body.input.data[0].type, "sentinel-2-l2a");

    return new Response(JSON.stringify({
      data: [{
        outputs: {
          ndvi: { bands: { B0: { stats: { mean: 0.5, min: 0.2, max: 0.8, sampleCount: 100, noDataCount: 10 } } } },
          ndwi: { bands: { B0: { stats: { mean: 0.1, min: -0.2, max: 0.3 } } } },
          nbr: { bands: { B0: { stats: { mean: 0.2, min: -0.1, max: 0.4 } } } },
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await fetchSpectralStatistics(
    "mock-sentinel-token",
    5,
    -1,
    new Date("2024-01-01T00:00:00.000Z"),
    new Date("2024-01-11T00:00:00.000Z"),
    mockFetch,
  );
  assertEquals(requestedUrl, "https://sh.dataspace.copernicus.eu/api/v1/statistics");
  assertEquals(result?.ndvi?.mean, 0.5);
  assertEquals(result?.validPixelRatio, 0.9);
});

Deno.test("Groq chat completion uses an injected mock fetch", async () => {
  let requestedUrl = "";
  let requestBody: Record<string, unknown> | null = null;
  const mockFetch: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: "mock narrative" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const response = await groqChatCompletion(
    "mock-groq-token",
    { model: "test-model", messages: [] },
    { fetcher: mockFetch },
  );
  assertEquals(requestedUrl, "https://api.groq.com/openai/v1/chat/completions");
  assertEquals(requestBody, { model: "test-model", messages: [] });
  assertEquals((await response.json()).choices[0].message.content, "mock narrative");
});
