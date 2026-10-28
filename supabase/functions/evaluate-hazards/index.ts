import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeUserOrCron } from "../_shared/auth.ts";
import { MAX_HAZARD_OBSERVATION_DISTANCE_KM } from "../_shared/analysis-constants.ts";
import { determineHazardSeverity, distanceKilometers } from "../_shared/hazard-severity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function evaluateOperator(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case ">": return value > threshold;
    case "<": return value < threshold;
    case ">=": return value >= threshold;
    case "<=": return value <= threshold;
    default: return value > threshold;
  }
}

function findNearestObservation(
  observations: Record<string, unknown>[],
  latitude: number,
  longitude: number,
): Record<string, unknown> | null {
  const candidates = observations
    .map((observation) => ({
      observation,
      distance: distanceKilometers(
        latitude,
        longitude,
        Number(observation.lat),
        Number(observation.lng),
      ),
    }))
    .filter(({ distance }) => Number.isFinite(distance) && distance <= MAX_HAZARD_OBSERVATION_DISTANCE_KM)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.observation ?? null;
}

function getMetricValue(observation: Record<string, unknown>, metric: string): number | null {
  if (metric === "daily_rain_sum") {
    // Daily totals are read from the same raw Open-Meteo response ingested with the observation.
    const rawData = observation.raw_data;
    if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return null;
    const raw = rawData as Record<string, unknown>;
    const current = raw.current;
    const daily = raw.daily;
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    if (!daily || typeof daily !== "object" || Array.isArray(daily)) return null;

    const currentTime = (current as Record<string, unknown>).time;
    const times = (daily as Record<string, unknown>).time;
    const rainSums = (daily as Record<string, unknown>).rain_sum;
    if (typeof currentTime !== "string" || !Array.isArray(times) || !Array.isArray(rainSums)) return null;
    const dayIndex = times.findIndex((date) => date === currentTime.slice(0, 10));
    if (dayIndex < 0) return null;
    const dailyRain = rainSums[dayIndex];
    return typeof dailyRain === "number" && Number.isFinite(dailyRain) ? dailyRain : null;
  }

  const value = observation[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function getAIAnalysis(hazardType: string, metricName: string, metricValue: number, thresholdValue: number, regionName: string) {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) {
    console.warn("GROQ_API_KEY is not configured; hazard alerts will omit generated analysis.");
    return null;
  }

  const systemText = "You are a disaster risk analyst specializing in African environmental hazards. Provide concise, actionable risk assessments in 2-3 sentences.";
  const userText = `A ${hazardType} hazard threshold has been triggered in ${regionName}. The ${metricName} reading is ${metricValue} (threshold: ${thresholdValue}). Provide a brief risk assessment and recommended actions.`;
  const modelChain = [
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "llama-3.1-8b-instant",
  ];
  const attemptsPerModel = 2;
  const retryDeadline = Date.now() + 18000;

  outer: for (const model of modelChain) {
    if (Date.now() >= retryDeadline) break;
    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      if (Date.now() >= retryDeadline) break outer;
      const requestController = new AbortController();
      const timeoutMs = Math.min(8000, retryDeadline - Date.now());
      const timeoutId = setTimeout(() => requestController.abort(), timeoutMs);
      let response: Response | null = null;

      try {
        response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemText },
              { role: "user", content: userText },
            ],
          }),
          signal: requestController.signal,
        });
      } catch (error) {
        console.error(
          `Hazard analysis request to ${model} timed out or failed (attempt ${attempt}):`,
          error instanceof Error ? error.message : error,
        );
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response) continue;
      if (response.ok) {
        try {
          const data = await response.json();
          const text = data?.choices?.[0]?.message?.content;
          if (typeof text === "string" && text.trim()) {
            return {
              assessment: text,
              model,
              generated_at: new Date().toISOString(),
              origin: "model_generated" as const,
            };
          }
          console.error(`Hazard analysis model ${model} returned no narrative content.`);
        } catch (error) {
          console.error(
            `Hazard analysis response from ${model} was invalid:`,
            error instanceof Error ? error.message : error,
          );
        }
        continue outer;
      }

      console.error(`Hazard analysis API error for ${model}:`, response.status);
      const retryable = response.status === 429 || response.status === 500 || response.status === 503;
      if (!retryable) break outer;
      if (attempt < attemptsPerModel && Date.now() < retryDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }

  console.warn("Hazard analysis model fallback chain was exhausted; alert will omit generated analysis.");
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!(await authorizeUserOrCron(req, supabase))) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all active thresholds
    const { data: thresholds, error: thresholdError } = await supabase
      .from("monitoring_thresholds")
      .select("*")
      .eq("is_active", true);

    if (thresholdError) throw thresholdError;
    if (!thresholds || thresholds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active thresholds to evaluate", alerts_created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const alertsCreated = [];

    for (const threshold of thresholds) {
      const latitudeDelta = MAX_HAZARD_OBSERVATION_DISTANCE_KM / 111.32;
      const longitudeDelta = MAX_HAZARD_OBSERVATION_DISTANCE_KM /
        (111.32 * Math.max(Math.cos(threshold.lat * Math.PI / 180), 0.01));
      const { data: observations, error: obsError } = await supabase
        .from("weather_observations")
        .select("*")
        .gte("lat", threshold.lat - latitudeDelta)
        .lte("lat", threshold.lat + latitudeDelta)
        .gte("lng", threshold.lng - longitudeDelta)
        .lte("lng", threshold.lng + longitudeDelta)
        .order("observation_date", { ascending: false })
        .limit(250);

      if (obsError) {
        console.error(`Failed to load observations for threshold ${threshold.id}:`, obsError.message);
        continue;
      }
      if (!observations || observations.length === 0) continue;

      const obs = findNearestObservation(observations, threshold.lat, threshold.lng);
      if (!obs) continue;
      const metricValue = getMetricValue(obs, threshold.metric);

      if (metricValue === null || metricValue === undefined) continue;

      const isTriggered = evaluateOperator(metricValue, threshold.operator, threshold.threshold_value);

      if (!isTriggered) continue;

      // Check if we already have an unresolved alert for this threshold
      const { data: existingAlerts } = await supabase
        .from("hazard_alerts")
        .select("id")
        .eq("threshold_id", threshold.id)
        .eq("is_resolved", false)
        .limit(1);

      if (existingAlerts && existingAlerts.length > 0) continue;

      const severity = determineHazardSeverity(metricValue, threshold.threshold_value);

      // Get AI analysis
      const aiAnalysis = await getAIAnalysis(
        threshold.hazard_type,
        threshold.metric,
        metricValue,
        threshold.threshold_value,
        threshold.region_name
      );

      const alert = {
        user_id: threshold.user_id,
        threshold_id: threshold.id,
        region_name: threshold.region_name,
        lat: threshold.lat,
        lng: threshold.lng,
        hazard_type: threshold.hazard_type,
        severity,
        title: `${threshold.hazard_type.charAt(0).toUpperCase() + threshold.hazard_type.slice(1)} Warning: ${threshold.region_name}`,
        description: `${threshold.metric} reading of ${metricValue} has exceeded the threshold of ${threshold.threshold_value} (${threshold.operator}).`,
        metric_name: threshold.metric,
        metric_value: metricValue,
        threshold_value: threshold.threshold_value,
        ai_analysis: aiAnalysis,
      };

      const { error: insertError } = await supabase
        .from("hazard_alerts")
        .insert(alert);

      if (!insertError) {
        alertsCreated.push(alert);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        thresholds_evaluated: thresholds.length,
        alerts_created: alertsCreated.length,
        alerts: alertsCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Hazard evaluation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
