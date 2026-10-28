import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AOI_HALF_WIDTH_DEGREES,
  DAYS_PER_MONTH_APPROXIMATION,
  ENABLE_UNVERIFIED_MODEL_FEATURES,
  FIRST_INTERIOR_SAMPLE_MIN_GAP_DAYS,
  INTERIOR_SAMPLE_HALF_WIDTH_DAYS,
  MIN_VALID_PIXEL_RATIO,
  NEAR_ZERO_NDVI_BASELINE,
  SECOND_INTERIOR_SAMPLE_MIN_GAP_DAYS,
  SENTINEL_2_BAND_RESOLUTIONS_METERS,
  SENTINEL_2_SENSOR,
  STATISTICS_GRID_SIZE,
} from "../_shared/analysis-constants.ts";
import type { FallbackReason } from "../_shared/analysis-constants.ts";
import {
  attachFieldProvenance,
  calculateChangePercent,
  createAnalysisWindows,
  deriveSeverity,
  deriveTrendDirection,
  normalizeNumericFields,
} from "../_shared/satellite-analysis.ts";
import type {
  AnalysisMethod,
  SpectralBandStats,
} from "../_shared/satellite-analysis.ts";
import { fetchSpectralStatistics } from "../_shared/sentinel-statistics.ts";
import type { SpectralStatsResult } from "../_shared/sentinel-statistics.ts";
import { groqChatCompletion } from "../_shared/groq-client.ts";
import {
  buildDeterministicSummary,
  checkNarrativeNumbers,
} from "../_shared/narrative-guard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation helpers
function validateString(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required and must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or less`);
  }
  return value.trim();
}

function validateDate(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a valid date string`);
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format`);
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`${fieldName} is not a valid date`);
  }
  return value;
}

function validateCoordinates(value: unknown): { lat: number; lng: number } | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'object') {
    throw new Error('Coordinates must be an object with lat and lng properties');
  }
  const coords = value as { lat?: unknown; lng?: unknown };
  if (coords.lat !== undefined || coords.lng !== undefined) {
    const lat = Number(coords.lat);
    const lng = Number(coords.lng);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      throw new Error('Latitude must be between -90 and 90');
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      throw new Error('Longitude must be between -180 and 180');
    }
    return { lat, lng };
  }
  return null;
}

function validateEventTypes(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value.trim()];
  if (!Array.isArray(value)) {
    throw new Error('Event types must be a string or array of strings');
  }
  return value.map(v => {
    if (typeof v !== 'string') throw new Error('Each event type must be a string');
    return v.trim();
  }).filter(v => v.length > 0).slice(0, 5);
}

type ClassificationType = "unsupervised_kmeans" | "unsupervised_isodata" | "supervised_ml" | "supervised_rf" | "supervised_svm";

function validateClassificationType(value: unknown): ClassificationType | null {
  const validTypes: ClassificationType[] = [
    "unsupervised_kmeans",
    "unsupervised_isodata",
    "supervised_ml",
    "supervised_rf",
    "supervised_svm",
  ];
  return typeof value === "string" && validTypes.includes(value as ClassificationType)
    ? value as ClassificationType
    : null;
}

// Without a strict schema for this array, the model occasionally wraps
// each recommendation in its own tiny JSON object (e.g. the literal string
// '{"recommendation":"..."}' instead of just the sentence), which then
// renders as raw JSON text in the UI/report instead of the recommendation
// itself. This recovers the real text if that happens.
function cleanTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const parsed = JSON.parse(trimmed);
            const firstString = parsed && typeof parsed === "object"
              ? Object.values(parsed).find((v) => typeof v === "string")
              : undefined;
            if (typeof firstString === "string") return firstString;
          } catch {
            // Not actually JSON - a sentence can legitimately start/end with braces.
          }
        }
        return trimmed;
      }
      if (item && typeof item === "object") {
        const firstString = Object.values(item).find((v) => typeof v === "string");
        if (typeof firstString === "string") return firstString;
      }
      return String(item);
    })
    .filter((s) => s.trim().length > 0);
}

function getAnalysisSensorInfo(lat: number | null, lng: number | null) {
  const widthMeters = lat === null
    ? null
    : 2 * AOI_HALF_WIDTH_DEGREES * 111_320 * Math.cos((lat * Math.PI) / 180);
  const heightMeters = 2 * AOI_HALF_WIDTH_DEGREES * 111_320;
  const metresPerCell = widthMeters === null
    ? null
    : { x: widthMeters / STATISTICS_GRID_SIZE, y: heightMeters / STATISTICS_GRID_SIZE };

  return {
    sensor: SENTINEL_2_SENSOR,
    statistics_grid: `${STATISTICS_GRID_SIZE}x${STATISTICS_GRID_SIZE}`,
    metres_per_cell: metresPerCell,
    native_band_resolutions_m: SENTINEL_2_BAND_RESOLUTIONS_METERS,
    aoi_half_width_degrees: AOI_HALF_WIDTH_DEGREES,
    center: lat !== null && lng !== null ? { lat, lng } : null,
    processing_level: "Level-2A",
  };
}

function buildFallbackAnalysis(params: {
  eventTypes: string[];
  region: string;
  startDate: string;
  endDate: string;
  coordinates: { lat: number; lng: number } | null;
  fallbackReason: FallbackReason;
  providerStatus: number;
  providerMessage: string;
}) {
  const {
    eventTypes,
    region,
    startDate,
    endDate,
    coordinates,
    fallbackReason,
    providerStatus,
    providerMessage,
  } = params;

  const result = {
    eventType: eventTypes[0],
    eventTypes,
    isMultiEvent: eventTypes.length > 1,
    region,
    startDate,
    endDate,
    analysisMethod: "model_only" as const,
    area: null,
    changePercent: null,
    summary: "Satellite analysis is temporarily unavailable; no measured values are available.",
    fullAnalysis: "The analysis provider is temporarily unavailable. No measured satellite values are being reported.",
    severity: null,
    recommendations: [
      "Retry this analysis in 1-2 minutes.",
      "Try a smaller date range if the issue continues.",
    ],
    dataSources: [],
    cloudCoverage: null,
    dataQuality: null,
    sensorInfo: getAnalysisSensorInfo(coordinates?.lat ?? null, coordinates?.lng ?? null),
    spectralIndices: null,
    classificationResults: null,
    classificationType: null,
    changeDetection: null,
    enableChangeDetection: false,
    multiEventAnalysis: null,
    temporalBreakdown: null,
    predictiveModeling: null,
    methodologyTransparency: null,
    coordinates,
    timestamp: new Date().toISOString(),
    fallback: true,
    fallbackReason,
    providerStatus,
    providerMessage,
    dataProvenance: {
      analysisMethod: "model_only" as const,
      disclaimer: "No measured Sentinel-2 values are available for this result.",
      realDataSourcesUsed: [],
    },
  };
  return attachFieldProvenance(result, "model_only", startDate, endDate, false);
}

// === Real spectral statistics via Sentinel Hub (Copernicus Data Space) ===
// The imagery panels (generate-visualization) already fetch real Sentinel-2
// pixels for the pictures; this does the same for the *numbers* - NDVI/NDWI/
// NBR means and a real before/after change figure - instead of asking the AI
// to estimate them. Same credentials, a different Sentinel Hub API
// (Statistics instead of Process) that aggregates real pixel values over an
// area/time range rather than rendering an image.
let cachedSentinelToken: { token: string; expiresAt: number } | null = null;

async function getSentinelHubToken(): Promise<string | null> {
  const clientId = Deno.env.get("SENTINELHUB_CLIENT_ID");
  const clientSecret = Deno.env.get("SENTINELHUB_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  if (cachedSentinelToken && cachedSentinelToken.expiresAt > Date.now() + 30_000) {
    return cachedSentinelToken.token;
  }

  let response: Response;
  try {
    response = await fetch(
      "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      }
    );
  } catch (e) {
    console.error("Sentinel Hub auth request failed:", e instanceof Error ? e.message : e);
    return null;
  }

  if (!response.ok) {
    console.error("Sentinel Hub auth failed:", response.status, (await response.text()).slice(0, 200));
    return null;
  }

  const data = await response.json();
  if (!data.access_token) return null;
  cachedSentinelToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedSentinelToken.token;
}

async function fetchSentinelSceneCount(
  token: string,
  lat: number,
  lng: number,
  from: Date,
  to: Date,
): Promise<number | null> {
  const west = lng - AOI_HALF_WIDTH_DEGREES;
  const south = lat - AOI_HALF_WIDTH_DEGREES;
  const east = lng + AOI_HALF_WIDTH_DEGREES;
  const north = lat + AOI_HALF_WIDTH_DEGREES;
  const polygon = `POLYGON((${west} ${south},${east} ${south},${east} ${north},${west} ${north},${west} ${south}))`;
  const filter = [
    "Collection/Name eq 'SENTINEL-2'",
    `ContentDate/Start ge ${from.toISOString()}`,
    `ContentDate/Start le ${to.toISOString()}`,
    `OData.CSC.Intersects(area=geography'SRID=4326;${polygon}')`,
  ].join(" and ");
  const url = new URL("https://catalogue.dataspace.copernicus.eu/odata/v1/Products");
  url.searchParams.set("$filter", filter);
  url.searchParams.set("$count", "true");
  url.searchParams.set("$top", "0");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("Sentinel catalogue scene count failed:", response.status);
      return null;
    }

    const data = await response.json();
    return typeof data["@odata.count"] === "number" ? data["@odata.count"] : null;
  } catch (error) {
    console.warn("Sentinel catalogue scene count request failed:", error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Database configuration missing");
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Optional authentication check - support both guest users and logged-in users
    const authHeader = req.headers.get("authorization");
    let user = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabase.auth.getUser(token);
      user = data?.user || null;
    }
    
    console.log(`Analysis request - User: ${user ? user.id : 'Guest'}`);

    const body = await req.json();
    
    let eventTypes = validateEventTypes(body.eventTypes || body.eventType);
    if (eventTypes.length === 0) {
      eventTypes = ['environmental_change'];
    }
    if (!ENABLE_UNVERIFIED_MODEL_FEATURES) eventTypes = eventTypes.slice(0, 1);
    
    const region = validateString(body.region, 'region', 200);
    const startDate = validateDate(body.startDate, 'startDate');
    const endDate = validateDate(body.endDate, 'endDate');
    const coordinates = validateCoordinates(body.coordinates);
    const classificationType = ENABLE_UNVERIFIED_MODEL_FEATURES
      ? validateClassificationType(body.classificationType)
      : null;
    const enableChangeDetection = ENABLE_UNVERIFIED_MODEL_FEATURES && body.enableChangeDetection === true;
    
    if (new Date(endDate) < new Date(startDate)) {
      throw new Error('endDate must be after startDate');
    }
    
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY not configured");
    }

    const isMultiEvent = eventTypes.length > 1;
    const eventTypeLabels = eventTypes.map(e => e.replace(/_/g, ' ')).join(', ');

    console.log(`Analyzing ${eventTypeLabels} in ${region} from ${startDate} to ${endDate}`);
    console.log("Model-written classification, change detection, and multi-event analysis are disabled.");

    // Real spectral statistics from Sentinel-2 pixels, when coordinates are
    // available: split the study period into a "before" and "after" window
    // (capped so "after" never reaches into the future, since satellite data
    // obviously doesn't exist yet for dates ahead of today) and fetch real
    // NDVI/NDWI/NBR means for each, so change_percent below can be a real
    // measured difference instead of an AI guess.
    let realStats: { before: SpectralStatsResult; after: SpectralStatsResult } | null = null;
    let realChangePercent: number | null = null;
    let realTemporalBreakdown: { label: string; changePercent: number; months: number }[] | null = null;
    let realPredictiveModeling: { trend_direction: "improving" | "stable" | "declining"; projected_change_6mo: number; projected_change_12mo: number; confidence: number | null; methodology: string } | null = null;
    let realSceneCount: number | null = null;
    let realWindowLengthDays: number | null = null;
    let fallbackReason: FallbackReason | null = coordinates ? "NO_CREDENTIALS" : "NO_COORDINATES";
    if (coordinates) {
      const hasSentinelCredentials = Boolean(
        Deno.env.get("SENTINELHUB_CLIENT_ID") && Deno.env.get("SENTINELHUB_CLIENT_SECRET"),
      );
      const sentinelToken = await getSentinelHubToken();
      if (sentinelToken) {
        fallbackReason = "SENTINEL_API_ERROR";
        const windows = createAnalysisWindows(startDate, endDate);
        if (windows) {
          const { studyStart, studyEnd, beforeTo, afterFrom } = windows;
          realWindowLengthDays = windows.windowLengthDays;
          // Wide enough that Sentinel-2's ~5-day revisit cycle has a real chance of
          // landing a cloud-free-enough scene even over persistently cloudy regions
          // (much of West Africa), without the before/after windows overlapping.

          const [beforeStats, afterStats] = await Promise.all([
            fetchSpectralStatistics(sentinelToken, coordinates.lat, coordinates.lng, studyStart, beforeTo),
            fetchSpectralStatistics(sentinelToken, coordinates.lat, coordinates.lng, afterFrom, studyEnd),
          ]);

          if (beforeStats?.ndvi && afterStats?.ndvi
            && beforeStats.validPixelRatio > MIN_VALID_PIXEL_RATIO
            && afterStats.validPixelRatio > MIN_VALID_PIXEL_RATIO) {
            realStats = { before: beforeStats, after: afterStats };
            const [beforeSceneCount, afterSceneCount] = await Promise.all([
              fetchSentinelSceneCount(sentinelToken, coordinates.lat, coordinates.lng, studyStart, beforeTo),
              fetchSentinelSceneCount(sentinelToken, coordinates.lat, coordinates.lng, afterFrom, studyEnd),
            ]);
            realSceneCount = beforeSceneCount !== null && afterSceneCount !== null
              ? beforeSceneCount + afterSceneCount
              : null;
            // NDVI change expressed as % of the baseline value, matching how
            // "change_percent" is used everywhere else in this app - guard
            // against a near-zero baseline making this figure meaningless.
            realChangePercent = calculateChangePercent(beforeStats.ndvi.mean, afterStats.ndvi.mean);
            fallbackReason = null;
            console.log(`Real Sentinel-2 stats: NDVI ${beforeStats.ndvi.mean.toFixed(3)} -> ${afterStats.ndvi.mean.toFixed(3)} (${realChangePercent.toFixed(1)}% change)`);

            // Real temporal breakdown: the "progress over time" chart used to
            // be entirely AI invention between our two real endpoints
            // (Sentinel Hub only ever gave us before/after, never quarterly
            // points). Sample 1-2 real interior windows in the gap between
            // the before/after windows so the intermediate points are
            // measured too, not just the two ends - degrading gracefully
            // (fewer points, not a fake one) if an interior sample is too
            // cloudy to trust.
            const pctChange = (value: number) => calculateChangePercent(beforeStats.ndvi!.mean, value);
            const monthsFromStart = (d: Date) => Math.round(
              (d.getTime() - studyStart.getTime())
                / (DAYS_PER_MONTH_APPROXIMATION * 24 * 60 * 60 * 1000),
            );

            const points: { date: Date; months: number; changePercent: number }[] = [
              { date: studyStart, months: 0, changePercent: 0 },
            ];

            const gapMs = afterFrom.getTime() - beforeTo.getTime();
            const interiorCount = gapMs > SECOND_INTERIOR_SAMPLE_MIN_GAP_DAYS * 24 * 60 * 60 * 1000
              ? 2
              : gapMs > FIRST_INTERIOR_SAMPLE_MIN_GAP_DAYS * 24 * 60 * 60 * 1000
                ? 1
                : 0;
            if (interiorCount > 0) {
              const interiorWindows = Array.from({ length: interiorCount }, (_, i) => {
                const frac = (i + 1) / (interiorCount + 1);
                const center = new Date(beforeTo.getTime() + gapMs * frac);
                const radius = Math.min(
                  INTERIOR_SAMPLE_HALF_WIDTH_DAYS * 24 * 60 * 60 * 1000,
                  gapMs / (interiorCount * 2),
                );
                return { from: new Date(center.getTime() - radius), to: new Date(center.getTime() + radius) };
              });
              const interiorResults = await Promise.all(
                interiorWindows.map((w) => fetchSpectralStatistics(sentinelToken, coordinates.lat, coordinates.lng, w.from, w.to))
              );
              interiorResults.forEach((stat, i) => {
                if (stat?.ndvi && stat.validPixelRatio > MIN_VALID_PIXEL_RATIO) {
                  const mid = new Date((interiorWindows[i].from.getTime() + interiorWindows[i].to.getTime()) / 2);
                  points.push({ date: mid, months: monthsFromStart(mid), changePercent: pctChange(stat.ndvi.mean) });
                }
              });
            }

            points.push({ date: studyEnd, months: monthsFromStart(studyEnd), changePercent: realChangePercent });
            points.sort((a, b) => a.date.getTime() - b.date.getTime());

            realTemporalBreakdown = points.map((p) => ({
              label: p.date.toLocaleDateString("en-US", { year: "numeric", month: "short" }),
              changePercent: Math.round(p.changePercent * 10) / 10,
              months: p.months,
            }));

            // Real least-squares linear regression over the measured points,
            // replacing the AI's invented 6/12-month projection with an
            // actual trend fit to genuine measurements. Confidence is a real
            // R^2, not a plausible-looking made-up number.
            const n = points.length;
            const sumX = points.reduce((s, p) => s + p.months, 0);
            const sumY = points.reduce((s, p) => s + p.changePercent, 0);
            const sumXY = points.reduce((s, p) => s + p.months * p.changePercent, 0);
            const sumXX = points.reduce((s, p) => s + p.months * p.months, 0);
            const denom = n * sumXX - sumX * sumX;
            const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
            const intercept = (sumY - slope * sumX) / n;
            const lastMonths = points[points.length - 1].months;
            const meanY = sumY / n;
            const ssTot = points.reduce((s, p) => s + (p.changePercent - meanY) ** 2, 0);
            const ssRes = points.reduce((s, p) => s + (p.changePercent - (slope * p.months + intercept)) ** 2, 0);
            const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : null;

            realPredictiveModeling = {
              trend_direction: deriveTrendDirection(slope),
              projected_change_6mo: Math.round((slope * (lastMonths + 6) + intercept) * 10) / 10,
              projected_change_12mo: Math.round((slope * (lastMonths + 12) + intercept) * 10) / 10,
              confidence: r2 === null ? null : Math.round(r2 * 100),
              methodology: `linear_regression over ${n} real Sentinel-2 measurements`,
            };
          } else {
            fallbackReason = beforeStats || afterStats
              ? "INSUFFICIENT_VALID_PIXELS"
              : "SENTINEL_API_ERROR";
            console.warn("Sentinel Hub statistics unavailable or too cloud-obscured for real change detection; numerical fields will be unavailable.");
          }
        }
      } else {
        fallbackReason = hasSentinelCredentials ? "SENTINEL_API_ERROR" : "NO_CREDENTIALS";
      }
    }

    let realAreaKm2: number | null = null;
    if (realStats && coordinates) {
      const widthMeters = 2 * AOI_HALF_WIDTH_DEGREES * 111_320 * Math.cos((coordinates.lat * Math.PI) / 180);
      const heightMeters = 2 * AOI_HALF_WIDTH_DEGREES * 111_320;
      realAreaKm2 = Math.round((widthMeters * heightMeters / 1_000_000) * 100) / 100;
    }

    const requestParams = {
      messages: [
        {
          role: "system",
          content: "Return JSON with summary, detailed_analysis, severity, and recommendations only. Never invent measurements or confidence scores. If supplied measured values are present, repeat only those exact values; otherwise avoid numbers and state that measurements are unavailable.",
        },
        {
          role: "user",
          content: `Write a concise narrative for ${eventTypeLabels} in ${region} from ${startDate} to ${endDate}. ${
            realStats
              ? `Measured NDVI changed from ${realStats.before.ndvi!.mean.toFixed(3)} to ${realStats.after.ndvi!.mean.toFixed(3)}; measured NDVI change is ${realChangePercent!.toFixed(1)}%.`
              : "No measured satellite values are available; do not make numerical claims."
          }`,
        },
      ],
      temperature: 0.7,
      // 4000 was already marginal for this schema (classification_results
      // alone can carry 20 classes x 6-band signatures) and the added
      // temporal_breakdown field pushed some responses over the limit,
      // truncating the JSON mid-object and silently losing change_percent/
      // temporal_breakdown to the regex-based fallback parser below.
      max_tokens: 8000,
      response_format: { type: "json_object" },
    };

    // Model fallback chain - if one is overloaded, try the next.
    // Ordered from most capable to most available.
    const modelChain = [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.6-27b",
    ];

    let aiResponse: Response | null = null;
    let lastErrorText = "";
    let lastStatus = 0;
    let successModel = "";
    const attemptsPerModel = 2;
    // 3 models x 2 attempts, each a real network round-trip to an overloaded
    // API, can otherwise compound to 40-90s on a degraded/rate-limited key -
    // long enough that a user watching a spinner reasonably assumes the app
    // is broken. The overall deadline alone doesn't bound this tightly
    // enough, since it only gates whether a NEW attempt starts - a single
    // slow in-flight request past that point can still run long. Each
    // attempt also gets its own timeout so no single request can consume
    // the whole budget by itself.
    const retryDeadline = Date.now() + 18000;

    outer: for (const model of modelChain) {
      if (Date.now() > retryDeadline) {
        console.warn("Groq retry time budget exceeded, stopping early.");
        break outer;
      }
      for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
        if (Date.now() > retryDeadline) break outer;
        const perRequestTimeoutMs = Math.min(8000, Math.max(2000, retryDeadline - Date.now()));
        const requestController = new AbortController();
        const requestTimeoutId = setTimeout(() => requestController.abort(), perRequestTimeoutMs);
        try {
          aiResponse = await groqChatCompletion(GROQ_API_KEY, { model, ...requestParams }, { signal: requestController.signal });
          } catch (e) {
          console.error(`AI request to ${model} timed out or failed (attempt ${attempt}):`, e instanceof Error ? e.message : e);
          aiResponse = null;
          lastStatus = 503; // treat a timeout the same as an overloaded provider for the fallback path below
          lastErrorText = "Request timed out";
          continue;
        } finally {
          clearTimeout(requestTimeoutId);
        }
        if (aiResponse.ok) {
          console.log(`AI success on model ${model} (attempt ${attempt})`);
          successModel = model;
          break outer;
        }
        lastErrorText = await aiResponse.text();
        lastStatus = aiResponse.status;
        console.error(`AI API error on ${model} (attempt ${attempt}/${attemptsPerModel}):`, aiResponse.status, lastErrorText.slice(0, 200));
        const modelUnavailable = aiResponse.status === 404;
        const isRetryable = aiResponse.status === 503 || aiResponse.status === 429 || aiResponse.status === 500;
        if (modelUnavailable) break;
        if (!isRetryable) break outer;
        // Short backoff between attempts on same model; rotate to next model after.
        if (attempt < attemptsPerModel && Date.now() < retryDeadline) {
          const delayMs = 800 * attempt + Math.random() * 400;
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      console.log(`Rotating to next model after ${model} failed with ${lastStatus}`);
    }

    if (!aiResponse || !aiResponse.ok) {
      const status = aiResponse?.status || 500;
      if (status === 503 || status === 500) {
        const fallbackResult = buildFallbackAnalysis({
          eventTypes,
          region,
          startDate,
          endDate,
          coordinates,
          fallbackReason: "PROVIDER_OVERLOAD",
          providerStatus: status,
          providerMessage: lastErrorText || "Groq is temporarily overloaded. Please try again in a minute.",
        });

        return new Response(
          JSON.stringify(fallbackResult),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Groq API rate limit reached. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI API error: ${status}`);
    }

    const aiData = await aiResponse.json();
    if (aiData.choices?.[0]?.finish_reason === "length") {
      console.warn("Groq response was truncated by max_tokens; JSON parsing may fail.");
    }
    let analysis = aiData.choices?.[0]?.message?.content || '';
    analysis = analysis.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let parsedAnalysis: Record<string, any>;
    let parseFailed = false;
    try {
      parsedAnalysis = JSON.parse(analysis);
    } catch (parseError) {
      parseFailed = true;
      console.error("Failed to parse AI response as JSON:", parseError);
      parsedAnalysis = {
        summary: analysis.split('\n')[0],
        detailed_analysis: analysis,
        recommendations: [],
      };
    }

    const narrativeMeasurements = {
      percentages: realStats
        ? [
          ...(realChangePercent === null ||
              Math.abs(realStats.before.ndvi?.mean ?? 0) <= NEAR_ZERO_NDVI_BASELINE
            ? []
            : [realChangePercent]),
          realStats.after.validPixelRatio * 100,
        ]
        : [],
      indices: {
        NDVI: [realStats?.before.ndvi?.mean, realStats?.after.ndvi?.mean].filter(
          (value): value is number => value !== undefined,
        ),
        NDWI: [realStats?.before.ndwi?.mean, realStats?.after.ndwi?.mean].filter(
          (value): value is number => value !== undefined,
        ),
        NBR: [realStats?.before.nbr?.mean, realStats?.after.nbr?.mean].filter(
          (value): value is number => value !== undefined,
        ),
      },
    };
    const getNarrativeFields = (parsed: Record<string, any>, raw: string) => ({
      summary: parsed.summary || parsed.detailed_analysis?.split('\n')[0] || raw,
      fullAnalysis: parsed.detailed_analysis || raw,
      recommendations: cleanTextArray(parsed.recommendations),
    });

    let narrativeFields = getNarrativeFields(parsedAnalysis, analysis);
    const initialMismatches = checkNarrativeNumbers(narrativeFields, narrativeMeasurements);
    let finalMismatches = initialMismatches;
    let retryAttempted = false;

    if (parseFailed || initialMismatches.length > 0) {
      retryAttempted = true;
      const strictMeasurements = realStats
        ? [
          `NDVI before: ${realStats.before.ndvi?.mean?.toFixed(3) ?? "unavailable"}`,
          `NDVI after: ${realStats.after.ndvi?.mean?.toFixed(3) ?? "unavailable"}`,
          `NDWI before: ${realStats.before.ndwi?.mean?.toFixed(3) ?? "unavailable"}`,
          `NDWI after: ${realStats.after.ndwi?.mean?.toFixed(3) ?? "unavailable"}`,
          `NBR before: ${realStats.before.nbr?.mean?.toFixed(3) ?? "unavailable"}`,
          `NBR after: ${realStats.after.nbr?.mean?.toFixed(3) ?? "unavailable"}`,
          `NDVI change: ${realChangePercent === null
            ? "unavailable"
            : Math.abs(realStats.before.ndvi?.mean ?? 0) <= NEAR_ZERO_NDVI_BASELINE
            ? `${realChangePercent.toFixed(1)} percentage points`
            : `${realChangePercent.toFixed(1)}%`}`,
          `Valid-pixel coverage: ${(realStats.after.validPixelRatio * 100).toFixed(1)}%`,
        ].join("; ")
        : "No measured numeric values are available.";
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), 8000);

      try {
        const retryResponse = await groqChatCompletion(
          GROQ_API_KEY,
          {
            model: successModel,
            ...requestParams,
            temperature: 0.1,
            messages: [
              {
                role: "system",
                content: "Return valid JSON with summary, detailed_analysis, severity, and recommendations only. Do not invent, estimate, round, or calculate any numbers. Use only the exact measured values supplied. If a number is not supplied, omit it. If no measurements are supplied, state that measurements are unavailable and use no numeric claims.",
              },
              {
                role: "user",
                content: `Rewrite the narrative for ${eventTypeLabels} in ${region} from ${startDate} to ${endDate}. The only available measured values are: ${strictMeasurements}. Use no other numeric claims.`,
              },
            ],
          },
          { signal: retryController.signal },
        );
        if (!retryResponse.ok) {
          console.error("Narrative guard retry failed:", retryResponse.status);
        } else {
          const retryData = await retryResponse.json();
          const retryAnalysis = String(retryData.choices?.[0]?.message?.content || "")
            .replace(/```json\s*/g, "")
            .replace(/```\s*/g, "")
            .trim();

          try {
            const retryParsed = JSON.parse(retryAnalysis);
            if (retryParsed && typeof retryParsed === "object" && !Array.isArray(retryParsed)) {
              analysis = retryAnalysis;
              parsedAnalysis = retryParsed;
              parseFailed = false;
              narrativeFields = getNarrativeFields(parsedAnalysis, analysis);
              finalMismatches = checkNarrativeNumbers(narrativeFields, narrativeMeasurements);
            } else {
              console.error("Narrative guard retry returned a non-object JSON value.");
            }
          } catch (retryParseError) {
            console.error("Narrative guard retry returned invalid JSON:", retryParseError);
          }
        }
      } catch (retryError) {
        console.error(
          "Narrative guard retry timed out or failed:",
          retryError instanceof Error ? retryError.message : retryError,
        );
      } finally {
        clearTimeout(retryTimeoutId);
      }
    }

    const replaceNarrative = finalMismatches.length > 0;
    const narrativeGuard = {
      checked: true,
      mismatches: finalMismatches.length,
      replaced: replaceNarrative,
    };
    console.info("NARRATIVE_GUARD", {
      initialMismatches: initialMismatches.length,
      finalMismatches: finalMismatches.length,
      retryAttempted,
      replaced: replaceNarrative,
    });

    // Real data, where fetched above, wins over whatever the AI produced -
    // this guarantees the "real" claim in dataProvenance is actually true
    // every time real stats succeeded, rather than merely "true if the AI
    // happened to follow the prompt's instruction to use them."
    const usedRealStats = !!realStats && !parseFailed;
    const finalChangePercent = usedRealStats ? realChangePercent : null;

    const realSpectralIndices: Record<string, SpectralBandStats> = {};
    if (usedRealStats) {
      if (realStats!.after.ndvi) realSpectralIndices.ndvi = realStats!.after.ndvi;
      if (realStats!.after.ndwi) realSpectralIndices.ndwi = realStats!.after.ndwi;
      if (realStats!.after.nbr) realSpectralIndices.nbr = realStats!.after.nbr;
    }

    const analysisMethod: AnalysisMethod = usedRealStats ? "measured" : "model_only";
    const numericFields = normalizeNumericFields(analysisMethod, {
      area: usedRealStats && realAreaKm2 !== null ? `${realAreaKm2} km²` : null,
      changePercent: finalChangePercent,
      temporalBreakdown: usedRealStats && realTemporalBreakdown?.length ? realTemporalBreakdown : null,
      spectralIndices: usedRealStats ? realSpectralIndices : null,
      predictiveModeling: usedRealStats ? realPredictiveModeling : null,
    });

    const result = {
      eventType: eventTypes[0],
      eventTypes,
      isMultiEvent: false,
      region,
      startDate,
      endDate,
      analysisMethod,
      ...numericFields,
      summary: replaceNarrative
        ? buildDeterministicSummary(
          region,
          startDate,
          endDate,
          usedRealStats && realStats && realChangePercent !== null
            ? {
              ndviBefore: realStats.before.ndvi!.mean,
              ndviAfter: realStats.after.ndvi!.mean,
              changePercent: realChangePercent,
              validPixelRatio: realStats.after.validPixelRatio,
              areaKm2: realAreaKm2 ?? 0,
              nearZeroBaseline: Math.abs(realStats.before.ndvi!.mean) <= NEAR_ZERO_NDVI_BASELINE,
            }
            : null,
        )
        : narrativeFields.summary,
      fullAnalysis: replaceNarrative
        ? "The generated narrative contained numeric claims that did not match measured values and was excluded."
        : narrativeFields.fullAnalysis,
      severity: usedRealStats ? deriveSeverity(realChangePercent!) : (parsedAnalysis.severity || null),
      recommendations: replaceNarrative ? [] : cleanTextArray(parsedAnalysis.recommendations),
      narrativeGuard,
      dataSources: usedRealStats
        ? ["Sentinel-2 MSI L2A statistics (Copernicus Data Space)", `Groq-generated narrative (${successModel})`]
        : [`Groq-generated narrative (${successModel}); no measured satellite values`],
      cloudCoverage: usedRealStats
        ? {
            validPixelRatio: realStats!.after.validPixelRatio,
            maskedPixelRatio: 1 - realStats!.after.validPixelRatio,
          }
        : null,
      dataQuality: usedRealStats
        ? {
            validPixelRatio: realStats!.after.validPixelRatio,
            sceneCount: realSceneCount,
            pixelSampleCount: realStats!.after.sampleCount,
            windowLengthDays: realWindowLengthDays,
          }
        : null,
      sensorInfo: getAnalysisSensorInfo(coordinates?.lat ?? null, coordinates?.lng ?? null),
      classificationResults: null,
      classificationType,
      changeDetection: null,
      enableChangeDetection: false,
      multiEventAnalysis: null,
      methodologyTransparency: null,
      fallbackReason: usedRealStats ? null : fallbackReason,
      dataProvenance: {
        analysisMethod: usedRealStats ? "measured" as const : "model_only" as const,
        disclaimer: usedRealStats
          ? `NDVI, NDWI, and NBR values, NDVI change, and valid-pixel coverage are measurements from Sentinel-2 MSI L2A pixels. Narrative text is generated by Groq and is not itself a measurement.`
          : "No measured Sentinel-2 pixel values are available. Narrative text is generated by Groq and must not be interpreted as measured data.",
        realDataSourcesUsed: usedRealStats ? ["Sentinel-2 MSI L2A statistics (Copernicus Data Space)"] : [],
      },
      coordinates,
      timestamp: new Date().toISOString(),
    };
    const resultWithProvenance = attachFieldProvenance(result, result.analysisMethod, startDate, endDate);

    if (user) {
      await supabase.from("analysis_results").insert({
        user_id: user.id,
        event_type: eventTypes.join(','),
        region: region,
        start_date: startDate,
        end_date: endDate,
        area_analyzed: resultWithProvenance.area,
        change_percent: resultWithProvenance.changePercent,
        summary: resultWithProvenance.summary,
        ai_analysis: { 
          fullAnalysis: resultWithProvenance.fullAnalysis,
          severity: resultWithProvenance.severity,
          recommendations: resultWithProvenance.recommendations,
          dataSources: resultWithProvenance.dataSources,
          cloudCoverage: resultWithProvenance.cloudCoverage,
          dataQuality: resultWithProvenance.dataQuality,
          sensorInfo: resultWithProvenance.sensorInfo,
          spectralIndices: resultWithProvenance.spectralIndices,
          classificationResults: resultWithProvenance.classificationResults,
          changeDetection: resultWithProvenance.changeDetection,
          multiEventAnalysis: resultWithProvenance.multiEventAnalysis,
          predictiveModeling: resultWithProvenance.predictiveModeling,
          isMultiEvent: false,
          eventTypes,
        },
        coordinates: coordinates,
      });
      console.log(`Analysis saved for user ${user.id}`);
    }

    return new Response(JSON.stringify(resultWithProvenance), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in analyze-satellite:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const status = errorMessage.includes("required") || errorMessage.includes("must be") ? 400 : 500;
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
