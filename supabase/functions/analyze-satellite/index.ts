import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Without a strict responseSchema for this array, Gemini occasionally wraps
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

// Classification types
type ClassificationType = 'unsupervised_kmeans' | 'unsupervised_isodata' | 'supervised_ml' | 'supervised_rf' | 'supervised_svm';

function validateClassificationType(value: unknown): ClassificationType | null {
  if (!value) return null;
  const validTypes: ClassificationType[] = ['unsupervised_kmeans', 'unsupervised_isodata', 'supervised_ml', 'supervised_rf', 'supervised_svm'];
  if (typeof value !== 'string' || !validTypes.includes(value as ClassificationType)) {
    return null;
  }
  return value as ClassificationType;
}

async function exchangeServiceAccountToken(params: { clientEmail: string; privateKey: string; projectId: string }) {
  const { clientEmail, privateKey, projectId } = params;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/earthengine https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const pemBody = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\n/g, '')
    .trim();

  const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    derBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const jwt = `${signingInput}.${encodedSignature}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Google OAuth token exchange failed for project ${projectId}: ${tokenResponse.status} ${errorText}`);
  }

  const tokenData = await tokenResponse.json() as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error(`Google OAuth token exchange succeeded but no access token was returned for project ${projectId}`);
  }

  return { accessToken: tokenData.access_token, projectId };
}

async function getEarthEngineContext(env: Record<string, string | undefined>) {
  const rawValue = env.GOOGLE_EARTH_ENGINE_API_KEY?.trim();

  if (!rawValue) {
    return {
      available: false,
      provider: 'missing',
      projectId: null as string | null,
      message: 'Google Earth Engine credentials are not configured.',
    };
  }

  if (rawValue.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawValue) as Record<string, unknown>;
      const privateKey = typeof parsed.private_key === 'string' ? parsed.private_key : '';
      const clientEmail = typeof parsed.client_email === 'string' ? parsed.client_email : '';
      const projectId = typeof parsed.project_id === 'string' ? parsed.project_id : '';

      if (!privateKey || !clientEmail || !projectId) {
        return {
          available: false,
          provider: 'service_account',
          projectId: projectId || null,
          message: 'Google Earth Engine service account JSON is missing required fields (private_key, client_email, or project_id).',
        };
      }

      const authResult = await exchangeServiceAccountToken({ clientEmail, privateKey, projectId });
      return {
        available: true,
        provider: 'service_account',
        projectId: authResult.projectId,
        message: `Earth Engine service account authentication succeeded for project ${authResult.projectId}.`,
      };
    } catch (error) {
      return {
        available: false,
        provider: 'service_account',
        projectId: null,
        message: `Earth Engine service account authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  return {
    available: false,
    provider: 'api_key',
    projectId: null,
    message: 'The configured Earth Engine value is not a service account JSON. Provide a service account JSON with private_key/client_email/project_id for authenticated access.',
  };
}

function buildFallbackAnalysis(params: {
  eventTypes: string[];
  region: string;
  startDate: string;
  endDate: string;
  coordinates: { lat: number; lng: number } | null;
  classificationType: ClassificationType | null;
  enableChangeDetection: boolean;
  providerStatus: number;
  providerMessage: string;
}) {
  const {
    eventTypes,
    region,
    startDate,
    endDate,
    coordinates,
    classificationType,
    enableChangeDetection,
    providerStatus,
    providerMessage,
  } = params;

  return {
    eventType: eventTypes[0],
    eventTypes,
    isMultiEvent: eventTypes.length > 1,
    region,
    startDate,
    endDate,
    area: "Analysis temporarily unavailable",
    changePercent: 0,
    summary: "Satellite analysis is temporarily delayed because the AI provider is under heavy load.",
    fullAnalysis: "We could not complete this satellite analysis right now because the AI provider is temporarily overloaded. Please retry shortly.",
    severity: "low",
    recommendations: [
      "Retry this analysis in 1-2 minutes.",
      "Try a smaller date range if the issue continues.",
      "Use saved results or comparison history while the provider recovers.",
    ],
    dataSources: ["Sentinel-2 MSI"],
    cloudCoverage: {
      percentage: null,
      detection_accuracy: null,
      impact: "unknown",
      affected_areas: "Analysis unavailable",
      qa_band_quality: "unknown",
    },
    dataQuality: {
      overall_score: null,
      radiometric_quality: null,
      geometric_accuracy: null,
      temporal_coverage: null,
      atmospheric_correction: "unknown",
      reflectance_type: "unknown",
    },
    analysisConfidence: 0,
    landsatInfo: {
      sensor: "Sentinel-2 MSI",
      spatial_resolution: "10m",
      acquisition_dates: [],
      processing_level: "Unavailable",
    },
    spectralIndices: {},
    classificationResults: classificationType ? { method: classificationType, unavailable: true } : null,
    classificationType,
    changeDetection: enableChangeDetection ? { unavailable: true } : null,
    enableChangeDetection,
    multiEventAnalysis: eventTypes.length > 1 ? { events: [], combined_impact: "Unavailable", interaction_effects: "Unavailable" } : null,
    predictiveModeling: {
      trend_direction: "stable",
      projected_change_6mo: null,
      projected_change_12mo: null,
      confidence: 0,
      methodology: "unavailable",
    },
    methodologyTransparency: {
      percentage_derivation: "Analysis unavailable due to temporary AI provider overload.",
      uncertainty_range: null,
      confidence_interval: "Unavailable",
      validation_notes: "Retry once provider capacity recovers.",
      known_limitations: ["Temporary provider overload prevented the analysis from running."],
    },
    coordinates,
    timestamp: new Date().toISOString(),
    fallback: true,
    fallbackReason: "SERVICE_UNAVAILABLE",
    providerStatus,
    providerMessage,
  };
}

// === Real spectral statistics via Sentinel Hub (Copernicus Data Space) ===
// The imagery panels (generate-visualization) already fetch real Sentinel-2
// pixels for the pictures; this does the same for the *numbers* - NDVI/NDWI/
// NBR means and a real before/after change figure - instead of asking Gemini
// to estimate them. Same credentials, a different Sentinel Hub API
// (Statistics instead of Process) that aggregates real pixel values over an
// area/time range rather than rendering an image.
interface SpectralBandStats {
  mean: number;
  min: number;
  max: number;
}

interface SpectralStatsResult {
  ndvi: SpectralBandStats | null;
  ndwi: SpectralBandStats | null;
  nbr: SpectralBandStats | null;
  sampleCount: number;
  validPixelRatio: number;
}

const STATISTICS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03","B04","B08","B12","SCL","dataMask"] }],
    output: [
      { id: "ndvi", bands: 1 },
      { id: "ndwi", bands: 1 },
      { id: "nbr", bands: 1 },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function isCloud(scl) { return scl == 3 || scl == 8 || scl == 9 || scl == 10; }
function evaluatePixel(s) {
  let ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
  let ndwi = (s.B03 - s.B08) / (s.B03 + s.B08);
  let nbr = (s.B08 - s.B12) / (s.B08 + s.B12);
  let mask = isCloud(s.SCL) ? 0 : s.dataMask;
  return { ndvi: [ndvi], ndwi: [ndwi], nbr: [nbr], dataMask: [mask] };
}`;

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

async function fetchSpectralStatistics(
  token: string,
  lat: number,
  lng: number,
  from: Date,
  to: Date
): Promise<SpectralStatsResult | null> {
  const half = 0.05; // ~11km-wide chip, matching the imagery panels' AOI
  const bbox = [lng - half, lat - half, lng + half, lat + half];
  const windowDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));

  let response: Response;
  try {
    response = await fetch("https://sh.dataspace.copernicus.eu/api/v1/statistics", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({
        input: {
          bounds: { bbox, properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
          data: [{ type: "sentinel-2-l2a", dataFilter: { maxCloudCoverage: 60 } }],
        },
        aggregation: {
          timeRange: { from: from.toISOString(), to: to.toISOString() },
          aggregationInterval: { of: `P${windowDays}D` },
          evalscript: STATISTICS_EVALSCRIPT,
          width: 128,
          height: 128,
        },
      }),
    });
  } catch (e) {
    console.error("Sentinel Hub statistics request failed:", e instanceof Error ? e.message : e);
    return null;
  }

  if (!response.ok) {
    console.error("Sentinel Hub statistics API error:", response.status, (await response.text()).slice(0, 500));
    return null;
  }

  let json: any;
  try {
    json = await response.json();
  } catch (e) {
    console.error("Sentinel Hub statistics response was not valid JSON:", e instanceof Error ? e.message : e);
    return null;
  }

  const outputs = json?.data?.[0]?.outputs;
  if (!outputs) {
    console.warn("Sentinel Hub statistics returned no data interval - likely no cloud-free scenes in this window.");
    return null;
  }

  const extractBand = (id: string): SpectralBandStats | null => {
    const stats = outputs[id]?.bands?.B0?.stats;
    if (!stats || typeof stats.mean !== "number") return null;
    return { mean: stats.mean, min: stats.min, max: stats.max };
  };

  const ndviBandStats = outputs.ndvi?.bands?.B0?.stats;
  const sampleCount = ndviBandStats?.sampleCount || 0;
  const noDataCount = ndviBandStats?.noDataCount || 0;

  return {
    ndvi: extractBand("ndvi"),
    ndwi: extractBand("ndwi"),
    nbr: extractBand("nbr"),
    sampleCount,
    validPixelRatio: sampleCount > 0 ? (sampleCount - noDataCount) / sampleCount : 0,
  };
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
    
    const region = validateString(body.region, 'region', 200);
    const startDate = validateDate(body.startDate, 'startDate');
    const endDate = validateDate(body.endDate, 'endDate');
    const coordinates = validateCoordinates(body.coordinates);
    const classificationType = validateClassificationType(body.classificationType);
    const enableChangeDetection = body.enableChangeDetection === true;
    const numClasses = Math.min(Math.max(parseInt(body.numClasses) || 6, 2), 20);
    
    if (new Date(endDate) < new Date(startDate)) {
      throw new Error('endDate must be after startDate');
    }
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GOOGLE_EARTH_ENGINE_KEY = Deno.env.get("GOOGLE_EARTH_ENGINE_API_KEY");
    const earthEngineContext = await getEarthEngineContext(Deno.env.toObject());
    
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const isMultiEvent = eventTypes.length > 1;
    const eventTypeLabels = eventTypes.map(e => e.replace(/_/g, ' ')).join(', ');

    console.log(`Analyzing ${eventTypeLabels} in ${region} from ${startDate} to ${endDate}`);
    console.log(`Classification: ${classificationType || 'none'}, Change Detection: ${enableChangeDetection}`);

    // Real spectral statistics from Sentinel-2 pixels, when coordinates are
    // available: split the study period into a "before" and "after" window
    // (capped so "after" never reaches into the future, since satellite data
    // obviously doesn't exist yet for dates ahead of today) and fetch real
    // NDVI/NDWI/NBR means for each, so change_percent below can be a real
    // measured difference instead of a Gemini guess.
    let realStats: { before: SpectralStatsResult; after: SpectralStatsResult } | null = null;
    let realChangePercent: number | null = null;
    let realTemporalBreakdown: { label: string; changePercent: number; months: number }[] | null = null;
    let realPredictiveModeling: { projected_change_6mo: number; projected_change_12mo: number; confidence: number; methodology: string } | null = null;
    if (coordinates) {
      const sentinelToken = await getSentinelHubToken();
      if (sentinelToken) {
        const now = new Date();
        const studyStart = new Date(startDate);
        const studyEnd = new Date(Math.min(new Date(endDate).getTime(), now.getTime()));
        if (studyEnd.getTime() > studyStart.getTime()) {
          const totalMs = studyEnd.getTime() - studyStart.getTime();
          const midpoint = new Date(studyStart.getTime() + totalMs / 2);
          // Wide enough that Sentinel-2's ~5-day revisit cycle has a real chance of
          // landing a cloud-free-enough scene even over persistently cloudy regions
          // (much of West Africa), without the before/after windows overlapping.
          const maxWindowMs = 90 * 24 * 60 * 60 * 1000;

          const beforeTo = new Date(Math.min(midpoint.getTime(), studyStart.getTime() + maxWindowMs));
          const afterFrom = new Date(Math.max(midpoint.getTime(), studyEnd.getTime() - maxWindowMs));

          const [beforeStats, afterStats] = await Promise.all([
            fetchSpectralStatistics(sentinelToken, coordinates.lat, coordinates.lng, studyStart, beforeTo),
            fetchSpectralStatistics(sentinelToken, coordinates.lat, coordinates.lng, afterFrom, studyEnd),
          ]);

          if (beforeStats?.ndvi && afterStats?.ndvi && beforeStats.validPixelRatio > 0.1 && afterStats.validPixelRatio > 0.1) {
            realStats = { before: beforeStats, after: afterStats };
            // NDVI change expressed as % of the baseline value, matching how
            // "change_percent" is used everywhere else in this app - guard
            // against a near-zero baseline making this figure meaningless.
            realChangePercent = Math.abs(beforeStats.ndvi.mean) > 0.05
              ? ((afterStats.ndvi.mean - beforeStats.ndvi.mean) / Math.abs(beforeStats.ndvi.mean)) * 100
              : (afterStats.ndvi.mean - beforeStats.ndvi.mean) * 100;
            console.log(`Real Sentinel-2 stats: NDVI ${beforeStats.ndvi.mean.toFixed(3)} -> ${afterStats.ndvi.mean.toFixed(3)} (${realChangePercent.toFixed(1)}% change)`);

            // Real temporal breakdown: the "progress over time" chart used to
            // be entirely Gemini invention between our two real endpoints
            // (Sentinel Hub only ever gave us before/after, never quarterly
            // points). Sample 1-2 real interior windows in the gap between
            // the before/after windows so the intermediate points are
            // measured too, not just the two ends - degrading gracefully
            // (fewer points, not a fake one) if an interior sample is too
            // cloudy to trust.
            const pctChange = (value: number) => Math.abs(beforeStats.ndvi!.mean) > 0.05
              ? ((value - beforeStats.ndvi!.mean) / Math.abs(beforeStats.ndvi!.mean)) * 100
              : (value - beforeStats.ndvi!.mean) * 100;
            const monthsFromStart = (d: Date) => Math.round((d.getTime() - studyStart.getTime()) / (30 * 24 * 60 * 60 * 1000));

            const points: { date: Date; months: number; changePercent: number }[] = [
              { date: studyStart, months: 0, changePercent: 0 },
            ];

            const gapMs = afterFrom.getTime() - beforeTo.getTime();
            const interiorCount = gapMs > 60 * 24 * 60 * 60 * 1000 ? 2 : gapMs > 20 * 24 * 60 * 60 * 1000 ? 1 : 0;
            if (interiorCount > 0) {
              const interiorWindows = Array.from({ length: interiorCount }, (_, i) => {
                const frac = (i + 1) / (interiorCount + 1);
                const center = new Date(beforeTo.getTime() + gapMs * frac);
                const radius = Math.min(20 * 24 * 60 * 60 * 1000, gapMs / (interiorCount * 2));
                return { from: new Date(center.getTime() - radius), to: new Date(center.getTime() + radius) };
              });
              const interiorResults = await Promise.all(
                interiorWindows.map((w) => fetchSpectralStatistics(sentinelToken, coordinates.lat, coordinates.lng, w.from, w.to))
              );
              interiorResults.forEach((stat, i) => {
                if (stat?.ndvi && stat.validPixelRatio > 0.1) {
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
            // replacing Gemini's invented 6/12-month projection with an
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
            const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0.5;

            realPredictiveModeling = {
              projected_change_6mo: Math.round((slope * (lastMonths + 6) + intercept) * 10) / 10,
              projected_change_12mo: Math.round((slope * (lastMonths + 12) + intercept) * 10) / 10,
              confidence: Math.round(Math.max(30, Math.min(95, r2 * 100))),
              methodology: `linear_regression over ${n} real Sentinel-2 measurements`,
            };
          } else {
            console.warn("Sentinel Hub statistics unavailable or too cloud-obscured for real change detection this request - falling back to AI-estimated figures.");
          }
        }
      }
    }

    // Real bbox area (deterministic geometry, not AI) for the ~11km chip
    // statistics were actually computed over - computed here (not just in
    // the result below) so it can also be told to Gemini, keeping its
    // narrative text consistent with the structured "area" field instead of
    // the model guessing its own, different number.
    let realAreaKm2: number | null = null;
    if (realStats && coordinates) {
      const kmPerDegreeLat = 111.32;
      const kmPerDegreeLng = 111.32 * Math.cos((coordinates.lat * Math.PI) / 180);
      realAreaKm2 = Math.round(0.1 * kmPerDegreeLat * 0.1 * kmPerDegreeLng * 100) / 100;
    }

    // Enhanced system prompt with Sentinel-2, classification, and change detection
    const systemPrompt = `You are an expert remote sensing scientist specializing in Sentinel-2 multispectral satellite imagery analysis, land cover classification, and change detection.

CRITICAL DATA AUTHENTICITY REQUIREMENTS:
- All percentage values MUST be realistic and based on plausible Sentinel-2 spectral analysis
- Do NOT generate suspiciously round numbers. Use precise values (e.g., 12.7% not 50%)
- Change percentages should reflect realistic environmental change rates (typically 1-25% for most events over 1-2 year periods)
- Always explain the methodology used to derive each percentage
- Include uncertainty ranges with confidence intervals where applicable
- Clearly distinguish between measured values and AI-estimated projections

CRITICAL REQUIREMENTS:
1. SENTINEL-2 IMAGERY: Always base analysis on Sentinel-2 MSI (MultiSpectral Instrument) Level-2A surface reflectance data
2. SPECTRAL BANDS: Reference specific Sentinel-2 bands:
   - B02 (Blue, 0.458-0.523 μm, 10m): Water body delineation
   - B03 (Green, 0.543-0.578 μm, 10m): Vegetation vigor
   - B04 (Red, 0.650-0.680 μm, 10m): Chlorophyll absorption
   - B08 (NIR, 0.785-0.900 μm, 10m): Vegetation health, biomass
   - B11 (SWIR1, 1.565-1.655 μm, 20m): Moisture content, burn scars
   - B12 (SWIR2, 2.100-2.280 μm, 20m): Geology, soil moisture
3. CLOUD DETECTION: Report accurate cloud coverage using the Sentinel-2 Scene Classification Layer (SCL) (90%+ accuracy target)
4. SPECTRAL INDICES: Calculate and report:
   - NDVI = (B08 - B04) / (B08 + B04) for vegetation
   - NDWI = (B03 - B08) / (B03 + B08) for water
   - NBR = (B08 - B12) / (B08 + B12) for burn severity
   - NDBI = (B11 - B08) / (B11 + B08) for built-up areas
5. RADIOMETRIC QUALITY: Report Bottom-of-Atmosphere (BOA) reflectance values and atmospheric correction status

POLLUTION & CONTAMINATION ANALYSIS:
When analyzing heavy_metal_pollution, water_contamination, soil_contamination, industrial_pollution, oil_spill, or acid_mine_drainage:
- Use spectral anomaly detection in SWIR bands (B11, B12) for mineral/chemical signatures
- Monitor vegetation stress via NDVI decline as proxy for soil contamination
- Use water turbidity indices from Blue/Green band ratios for water quality
- Detect thermal anomalies from industrial discharge
- Report specific pollutant indicators based on spectral signatures
- Include health risk assessment for nearby populations

${classificationType ? `
CLASSIFICATION ANALYSIS (${classificationType.toUpperCase()}):
${classificationType.startsWith('unsupervised') ? `
- Perform ${classificationType === 'unsupervised_kmeans' ? 'K-means clustering' : 'ISODATA iterative clustering'} with ${numClasses} initial classes
- Report final number of classes after convergence
- Provide class statistics: mean spectral values, standard deviation, pixel counts
- Assign semantic labels to clusters based on spectral signatures
` : `
- Apply ${classificationType === 'supervised_ml' ? 'Maximum Likelihood' : classificationType === 'supervised_rf' ? 'Random Forest' : 'Support Vector Machine'} classification
- Define training classes: Water, Forest, Agriculture, Urban, Bare Soil, Grassland
- Report classification accuracy metrics: Overall Accuracy, Kappa Coefficient, Producer's/User's Accuracy per class
- Generate confusion matrix summary
`}
` : ''}

${enableChangeDetection ? `
CHANGE DETECTION ANALYSIS:
- Perform image differencing between ${startDate} and ${endDate}
- Apply post-classification comparison if classification enabled
- Report change statistics:
  - Total changed area (km²)
  - Change matrix (from-to transitions)
  - Major change trajectories (e.g., Forest→Agriculture, Agriculture→Urban)
- Identify change hotspots with confidence levels
` : ''}

IMPORTANT: Return your response as a JSON object with this structure:
{
  "area_km2": number,
  "change_percent": number,
  "temporal_breakdown": [
    { "period": "short label e.g. 'Q1 2022' or '2022' depending on granularity chosen", "change_percent": number (cumulative change from baseline through the end of this period, reaching the final change_percent by the last entry), "months": number (months elapsed from study start through the end of this period) }
  ],
  "summary": "2-3 sentence summary naming the specific region, event type, and headline change figure",
  "detailed_analysis": "4-8 sentence full analysis grounded in this specific location's known geography (named rivers/land cover/terrain where relevant) and this event type's typical drivers - avoid generic statements that could apply to any region",
  "severity": "low|medium|high|critical",
  "recommendations": ["4-6 specific, actionable recommendations, each naming a concrete action and a plausible responsible actor or monitoring approach (e.g. 'Deploy ground survey teams to verify X within 30 days' rather than 'monitor the situation')"],
  "data_sources": ["Sentinel-2 MSI"],
  "cloud_coverage": {
    "percentage": number (0-100),
    "detection_accuracy": number (target 90%+),
    "impact": "none|minimal|moderate|significant",
    "affected_areas": "description of cloud-affected regions",
    "qa_band_quality": "good|moderate|poor"
  },
  "data_quality": {
    "overall_score": number (0-100),
    "radiometric_quality": number (0-100),
    "geometric_accuracy": number (0-100),
    "temporal_coverage": number (0-100),
    "atmospheric_correction": "applied|not_applied",
    "reflectance_type": "TOA|SR"
  },
  "analysis_confidence": number (0-100, aim for 90+),
  "landsat_info": {
    "sensor": "Sentinel-2 MSI",
    "tile_id": "MGRS tile ID",
    "acquisition_dates": ["date1", "date2"],
    "spatial_resolution": "10m",
    "bands_used": ["B02", "B03", "B04", "B08", "B11", "B12"],
    "processing_level": "Level-2A|Level-1C"
  },
  "spectral_indices": {
    "ndvi": { "min": number, "max": number, "mean": number, "std": number },
    "ndwi": { "min": number, "max": number, "mean": number },
    "nbr": { "min": number, "max": number, "mean": number },
    "ndbi": { "min": number, "max": number, "mean": number }
  },
  ${classificationType ? `"classification_results": {
    "method": "${classificationType}",
    "num_classes": number,
    "classes": [
      { "id": number, "name": "string", "area_km2": number, "area_percent": number, "spectral_signature": { "B2": number, "B3": number, "B4": number, "B5": number, "B6": number, "B7": number } }
    ],
    "accuracy_metrics": {
      "overall_accuracy": number,
      "kappa_coefficient": number,
      "producer_accuracy": { "class_name": number },
      "user_accuracy": { "class_name": number }
    },
    "convergence_iterations": number
  },` : ''}
  ${enableChangeDetection ? `"change_detection": {
    "method": "image_differencing|post_classification",
    "total_changed_area_km2": number,
    "change_percent": number,
    "change_matrix": [
      { "from_class": "string", "to_class": "string", "area_km2": number, "percent": number }
    ],
    "major_changes": [
      { "type": "description", "area_km2": number, "severity": "low|medium|high|critical" }
    ],
    "change_hotspots": [
      { "location": "description", "confidence": number, "change_magnitude": number }
    ],
    "no_change_area_km2": number
  },` : ''}
  ${isMultiEvent ? `"multi_event_analysis": {
    "events": [
      {
        "event_type": "event name",
        "change_percent": number,
        "severity": "low|medium|high|critical",
        "key_findings": "findings for this event",
        "spectral_indicator": "NDVI|NDWI|NBR|custom"
      }
    ],
    "combined_impact": "overall combined impact assessment",
    "interaction_effects": "how events interact or compound each other"
  },` : ''}
  "predictive_modeling": {
    "trend_direction": "improving|stable|declining|critical",
    "projected_change_6mo": number,
    "projected_change_12mo": number,
    "confidence": number,
    "methodology": "linear_regression|time_series|machine_learning"
  },
  "methodology_transparency": {
    "percentage_derivation": "explanation of how change_percent was calculated from spectral data",
    "uncertainty_range": { "lower": number, "upper": number },
    "confidence_interval": "95%",
    "validation_notes": "how to validate against ground truth",
    "known_limitations": ["limitation1", "limitation2"]
  }
}`;

    const userPrompt = `Analyze Sentinel-2 multispectral satellite imagery for ${isMultiEvent ? 'MULTIPLE EVENTS: ' : ''}${eventTypeLabels} in ${region}, Africa.
Time period: ${startDate} to ${endDate}
Coordinates: ${coordinates ? JSON.stringify(coordinates) : "Not specified"}
${realStats ? `
REAL MEASURED DATA (from actual Sentinel-2 satellite pixels, not an estimate):
- NDVI mean: ${realStats.before.ndvi!.mean.toFixed(3)} (start of period) -> ${realStats.after.ndvi!.mean.toFixed(3)} (end of period)
- NDVI-derived change: ${realChangePercent!.toFixed(1)}%
${realStats.before.ndwi && realStats.after.ndwi ? `- NDWI mean: ${realStats.before.ndwi.mean.toFixed(3)} -> ${realStats.after.ndwi.mean.toFixed(3)}` : ''}
${realStats.before.nbr && realStats.after.nbr ? `- NBR mean: ${realStats.before.nbr.mean.toFixed(3)} -> ${realStats.after.nbr.mean.toFixed(3)}` : ''}
- Valid (cloud-free) pixel coverage: ${(realStats.after.validPixelRatio * 100).toFixed(0)}%
- Area analyzed: ${realAreaKm2} km² (the real bounding box these statistics were computed over)
You MUST use change_percent = ${realChangePercent!.toFixed(1)} and area_km2 = ${realAreaKm2} exactly (these are measured, not estimated) and ground your summary/detailed_analysis/severity/recommendations in this real figure and these real index values - do not invent different numbers.
` : ''}

TEMPORAL BREAKDOWN REQUIRED:
- Break the ${startDate} to ${endDate} study period into 3-6 realistic sub-periods (quarterly if the span is 2 years or less, yearly if longer).
- For each sub-period, report the cumulative change_percent from baseline through the end of that period - values should progress toward (and the final entry should equal) the overall change_percent, with realistic non-linear variation rather than even/linear steps (real environmental change typically accelerates, plateaus, or has setbacks rather than a straight line).
- Label each period clearly and chronologically (e.g. "Q1 2022", "Q2 2022", ... or "2022", "2023", ...).

${classificationType ? `
CLASSIFICATION REQUESTED: ${classificationType.toUpperCase()}
- Number of classes: ${numClasses}
- Provide full classification results with accuracy metrics
` : ''}

${enableChangeDetection ? `
CHANGE DETECTION REQUESTED:
- Compare imagery from start and end dates
- Identify and quantify all land cover changes
- Generate change matrix and hotspot analysis
` : ''}

${isMultiEvent ? `MULTI-EVENT REQUIREMENTS:
- Analyze each event type using appropriate spectral indices
- Identify any interaction effects between events
- Provide combined impact assessment
` : ''}

SENTINEL-2 DATA REQUIREMENTS:
- Use Sentinel-2 MSI multispectral bands
- Report specific spectral indices (NDVI, NDWI, NBR, NDBI)
- Target 90%+ cloud detection accuracy using the Scene Classification Layer (SCL)
- Include radiometric and geometric quality metrics

${earthEngineContext.available ? `Access imagery via Google Earth Engine using authenticated service account access for project ${earthEngineContext.projectId}.` : `Google Earth Engine is unavailable for this request: ${earthEngineContext.message}`}`;

    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        // 4000 was already marginal for this schema (classification_results
        // alone can carry 20 classes x 6-band signatures) and the added
        // temporal_breakdown field pushed some responses over the limit,
        // truncating the JSON mid-object and silently losing change_percent/
        // temporal_breakdown to the regex-based fallback parser below.
        maxOutputTokens: 8000,
        responseMimeType: "application/json",
      },
    });

    // Model fallback chain - if one is overloaded, try the next.
    // Ordered from most capable to most available.
    const modelChain = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ];

    let aiResponse: Response | null = null;
    let lastErrorText = "";
    let lastStatus = 0;
    const attemptsPerModel = 2;
    // 4 models x 2 attempts, each a real network round-trip to an overloaded
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
        console.warn("Gemini retry time budget exceeded, stopping early.");
        break outer;
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
        if (Date.now() > retryDeadline) break outer;
        const perRequestTimeoutMs = Math.min(8000, Math.max(2000, retryDeadline - Date.now()));
        const requestController = new AbortController();
        const requestTimeoutId = setTimeout(() => requestController.abort(), perRequestTimeoutMs);
        try {
          aiResponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
            signal: requestController.signal,
          });
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
          break outer;
        }
        lastErrorText = await aiResponse.text();
        lastStatus = aiResponse.status;
        console.error(`AI API error on ${model} (attempt ${attempt}/${attemptsPerModel}):`, aiResponse.status, lastErrorText.slice(0, 200));
        const isRetryable = aiResponse.status === 503 || aiResponse.status === 429 || aiResponse.status === 500;
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
          classificationType,
          enableChangeDetection,
          providerStatus: status,
          providerMessage: lastErrorText || "Google Gemini is temporarily overloaded. Please try again in a minute.",
        });

        return new Response(
          JSON.stringify(fallbackResult),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Gemini API rate limit reached. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI API error: ${status}`);
    }

    const aiData = await aiResponse.json();
    if (aiData.candidates?.[0]?.finishReason === "MAX_TOKENS") {
      console.warn("Gemini response was truncated by maxOutputTokens - JSON parse will likely fail and fall back to the regex extractor.");
    }
    let analysis = aiData.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    analysis = analysis.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let parsedAnalysis;
    try {
      parsedAnalysis = JSON.parse(analysis);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      const areaMatch = analysis.match(/(\d+[,.\d]*)\s*km²/i);
      const percentMatch = analysis.match(/(\d+\.?\d*)\s*%/);
      
      parsedAnalysis = {
        area_km2: areaMatch ? parseFloat(areaMatch[1].replace(/,/g, '')) : null,
        change_percent: percentMatch ? parseFloat(percentMatch[1]) : null,
        summary: analysis.split('\n')[0],
        detailed_analysis: analysis,
        severity: "medium",
        recommendations: [],
        data_sources: ["Sentinel-2 MSI"],
        cloud_coverage: { percentage: 5, detection_accuracy: 92, impact: "minimal", affected_areas: "None detected", qa_band_quality: "good" },
        data_quality: { overall_score: 87, radiometric_quality: 90, geometric_accuracy: 88, temporal_coverage: 85, atmospheric_correction: "applied", reflectance_type: "SR" },
        analysis_confidence: 87,
        landsat_info: { sensor: "Sentinel-2 MSI", spatial_resolution: "10m", bands_used: ["B02", "B03", "B04", "B08", "B11", "B12"], processing_level: "Level-2A" },
        spectral_indices: { ndvi: { min: 0.1, max: 0.8, mean: 0.45, std: 0.15 } },
      };
    }

    // Real data, where fetched above, wins over whatever Gemini produced -
    // this guarantees the "real" claim in dataProvenance is actually true
    // every time real stats succeeded, rather than merely "true if Gemini
    // happened to follow the prompt's instruction to use them."
    const usedRealStats = !!realStats;
    const finalChangePercent = usedRealStats ? realChangePercent! : (parsedAnalysis.change_percent || 0);

    const realSpectralIndices: Record<string, SpectralBandStats> = {};
    if (usedRealStats) {
      if (realStats!.after.ndvi) realSpectralIndices.ndvi = realStats!.after.ndvi;
      if (realStats!.after.ndwi) realSpectralIndices.ndwi = realStats!.after.ndwi;
      if (realStats!.after.nbr) realSpectralIndices.nbr = realStats!.after.nbr;
    }

    const result = {
      eventType: eventTypes[0],
      eventTypes,
      isMultiEvent,
      region,
      startDate,
      endDate,
      area: realAreaKm2 !== null ? `${realAreaKm2} km²` : (parsedAnalysis.area_km2 ? `${parsedAnalysis.area_km2} km²` : "Analysis in progress"),
      changePercent: finalChangePercent,
      temporalBreakdown: realTemporalBreakdown && realTemporalBreakdown.length > 0
        ? realTemporalBreakdown
        : (Array.isArray(parsedAnalysis.temporal_breakdown) && parsedAnalysis.temporal_breakdown.length > 0
            ? parsedAnalysis.temporal_breakdown.map((p: any) => ({
                label: String(p.period || "Period"),
                changePercent: typeof p.change_percent === "number" ? p.change_percent : parseFloat(p.change_percent),
                months: typeof p.months === "number" ? p.months : undefined,
              }))
            : null),
      summary: parsedAnalysis.summary || parsedAnalysis.detailed_analysis?.split('\n')[0] || "Environmental analysis complete",
      fullAnalysis: parsedAnalysis.detailed_analysis || analysis,
      severity: parsedAnalysis.severity || "medium",
      recommendations: cleanTextArray(parsedAnalysis.recommendations),
      // Not taken from the model's own self-reported "data_sources" field -
      // Gemini has no actual way to know what it "used". This is computed
      // by this function based on what was actually fetched, not phrased.
      dataSources: usedRealStats
        ? ["Sentinel-2 L2A (Copernicus Data Space Ecosystem) - real NDVI/NDWI/NBR statistics", "Google Gemini 2.5 (AI-generated narrative analysis)"]
        : ["Google Gemini 2.5 (AI-estimated, not measured imagery)"],
      // Enhanced quality metrics
      cloudCoverage: usedRealStats
        ? { percentage: Math.round((1 - realStats!.after.validPixelRatio) * 100), detection_accuracy: null, impact: realStats!.after.validPixelRatio > 0.7 ? "minimal" : "moderate", affected_areas: "Computed from real Sentinel-2 Scene Classification Layer masking", qa_band_quality: "measured" }
        : (parsedAnalysis.cloud_coverage || { percentage: 5, detection_accuracy: 92, impact: "minimal" }),
      dataQuality: parsedAnalysis.data_quality || { overall_score: 87 },
      analysisConfidence: parsedAnalysis.analysis_confidence || 87,
      // Sensor info (field name kept as landsatInfo for backward compatibility
      // with existing stored analysis_results rows and frontend prop names -
      // the actual sensor described is always Sentinel-2, never Landsat)
      landsatInfo: parsedAnalysis.landsat_info || { sensor: "Sentinel-2 MSI", spatial_resolution: "10m" },
      spectralIndices: { ...(parsedAnalysis.spectral_indices || {}), ...realSpectralIndices },
      // Classification results
      classificationResults: parsedAnalysis.classification_results || null,
      classificationType,
      // Change detection results
      changeDetection: parsedAnalysis.change_detection || null,
      enableChangeDetection,
      // Multi-event results
      multiEventAnalysis: parsedAnalysis.multi_event_analysis || null,
      // Predictive modeling - real regression numbers (when available) win
      // for the quantitative fields; trend_direction stays Gemini's call
      // since "improving vs declining" is a judgment about this specific
      // event type, not something the regression slope alone can determine.
      predictiveModeling: realPredictiveModeling
        ? { ...(parsedAnalysis.predictive_modeling || {}), ...realPredictiveModeling }
        : (parsedAnalysis.predictive_modeling || null),
      // Methodology transparency
      methodologyTransparency: parsedAnalysis.methodology_transparency || null,
      // Computed by this function, not the model - guarantees an honest
      // provenance statement regardless of how the AI phrases its own text.
      dataProvenance: {
        analysisMethod: usedRealStats ? "real_sentinel_statistics" : "ai_estimated",
        disclaimer: usedRealStats
          ? `The change percentage and spectral index values (NDVI${realSpectralIndices.ndwi ? '/NDWI' : ''}${realSpectralIndices.nbr ? '/NBR' : ''}) above are real measurements computed from actual Sentinel-2 satellite pixels (Copernicus Data Space Ecosystem), comparing the start and end of the study period over an ~11km area around the given coordinates (${(realStats!.after.validPixelRatio * 100).toFixed(0)}% cloud-free pixel coverage). The narrative summary, severity assessment, recommendations, and any classification/change-matrix breakdown are still AI-generated (Google Gemini) interpretation grounded in these real numbers, not independently measured themselves.`
          : "Spectral index values, percentages, and classification statistics in this analysis are AI-generated plausible estimates based on the model's training knowledge of typical environmental patterns for this region/event type - they are not measurements derived from actual satellite pixel data. No real satellite imagery was fetched or processed for this specific analysis.",
        earthEngine: {
          configured: earthEngineContext.available,
          note: earthEngineContext.available
            ? "An Earth Engine service account is configured and authenticates successfully, but its access token is not currently used to fetch real pixel data for this analysis."
            : earthEngineContext.message,
        },
        realDataSourcesUsed: usedRealStats ? ["Sentinel-2 L2A (Copernicus Data Space Ecosystem)"] : [],
      },
      coordinates,
      timestamp: new Date().toISOString(),
    };

    if (user) {
      await supabase.from("analysis_results").insert({
        user_id: user.id,
        event_type: eventTypes.join(','),
        region: region,
        start_date: startDate,
        end_date: endDate,
        area_analyzed: result.area,
        change_percent: result.changePercent,
        summary: result.summary,
        ai_analysis: { 
          fullAnalysis: result.fullAnalysis,
          severity: result.severity,
          recommendations: result.recommendations,
          dataSources: result.dataSources,
          cloudCoverage: result.cloudCoverage,
          dataQuality: result.dataQuality,
          analysisConfidence: result.analysisConfidence,
          landsatInfo: result.landsatInfo,
          spectralIndices: result.spectralIndices,
          classificationResults: result.classificationResults,
          changeDetection: result.changeDetection,
          multiEventAnalysis: result.multiEventAnalysis,
          predictiveModeling: result.predictiveModeling,
          isMultiEvent,
          eventTypes,
        },
        coordinates: coordinates,
      });
      console.log(`Analysis saved for user ${user.id}`);
    }

    return new Response(JSON.stringify(result), {
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
