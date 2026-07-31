import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function determineSeverity(value: number, threshold: number, hazardType: string): string {
  const ratio = Math.abs(value - threshold) / Math.max(Math.abs(threshold), 1);
  if (ratio > 1.5) return "critical";
  if (ratio > 0.75) return "high";
  if (ratio > 0.3) return "moderate";
  return "low";
}

async function getAIAnalysis(hazardType: string, metricName: string, metricValue: number, thresholdValue: number, regionName: string) {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return null;

  try {
    const systemText = "You are a disaster risk analyst specializing in African environmental hazards. Provide concise, actionable risk assessments in 2-3 sentences.";
    const userText = `A ${hazardType} hazard threshold has been triggered in ${regionName}. The ${metricName} reading is ${metricValue} (threshold: ${thresholdValue}). Provide a brief risk assessment and recommended actions.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('') || null;
    return {
      assessment: text,
      model: "gemini-2.5-flash",
      generated_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      // Get the most recent observation for this region
      const { data: observations, error: obsError } = await supabase
        .from("weather_observations")
        .select("*")
        .eq("region_name", threshold.region_name)
        .order("observation_date", { ascending: false })
        .limit(1);

      if (obsError || !observations || observations.length === 0) continue;

      const obs = observations[0];
      const metricValue = obs[threshold.metric as keyof typeof obs] as number | null;

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

      const severity = determineSeverity(metricValue, threshold.threshold_value, threshold.hazard_type);

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
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
