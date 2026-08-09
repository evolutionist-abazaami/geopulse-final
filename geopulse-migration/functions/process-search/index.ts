import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation helper
function validateQuery(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Query is required and must be a non-empty string');
  }
  if (value.length > 1000) {
    throw new Error('Query must be 1000 characters or less');
  }
  return value.trim();
}

interface GeocodedLocation {
  name: string;
  lat: number | null;
  lng: number | null;
  verified: boolean;
  source: "nominatim" | "ai_estimate";
}

// Gemini identifies *which* places a query is about; real coordinates come
// from Nominatim (OpenStreetMap) so the map/report never plots a place at
// coordinates the model invented. Sequential with a short gap between calls
// per Nominatim's usage policy (max ~1 request/second, no concurrent bursts).
async function geocodeLocation(name: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(name)}&viewbox=-18,37,52,-35&bounded=0&limit=1`;
    const response = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "GeoPulse Environmental Analysis App (process-search geocoding)",
      },
    });
    if (!response.ok) return null;
    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) return null;
    const lat = parseFloat(results[0].lat);
    const lng = parseFloat(results[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch (error) {
    console.error(`Nominatim geocode failed for "${name}":`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function resolveLocations(rawLocations: unknown[]): Promise<GeocodedLocation[]> {
  const resolved: GeocodedLocation[] = [];
  for (const raw of rawLocations.slice(0, 5)) {
    const entry = raw as Record<string, unknown>;
    const name = typeof entry?.name === "string" && entry.name.trim() ? entry.name.trim() : "Unspecified location";

    const geocoded = await geocodeLocation(name);
    if (geocoded) {
      resolved.push({ name, lat: geocoded.lat, lng: geocoded.lng, verified: true, source: "nominatim" });
    } else {
      // Geocoding found nothing real for this name - fall back to the
      // model's own estimate, but flag it so the UI/report can be honest
      // that this position is not a verified real-world coordinate.
      const fallbackLat = Number(entry?.lat);
      const fallbackLng = Number(entry?.lng);
      resolved.push({
        name,
        lat: Number.isFinite(fallbackLat) ? fallbackLat : null,
        lng: Number.isFinite(fallbackLng) ? fallbackLng : null,
        verified: false,
        source: "ai_estimate",
      });
    }
    // Stay well under Nominatim's rate limit when resolving multiple names.
    if (rawLocations.length > 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return resolved;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check authentication first
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Database configuration missing");
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const authHeader = req.headers.get("authorization");
    let user = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabase.auth.getUser(token);
      user = data?.user || null;
    }

    // Parse and validate input
    const body = await req.json();
    const query = validateQuery(body.query);
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    console.log(`Processing search query for user ${user?.id || 'anonymous'}: ${query.substring(0, 100)}...`);

    // Prepare system prompt for natural language search
    const systemPrompt = `You are an AI assistant specialized in geospatial search and environmental data interpretation.
Your role is to:
1. Interpret natural language queries about environmental changes across Africa
2. Extract key information: location, event type, time period, specific concerns
3. Identify which real places (city, region, or country) the query refers to
4. Suggest monitoring strategies and data sources
5. Assess confidence levels based on data availability

Format responses as structured JSON with:
- interpretation: Clear explanation of what the user is looking for (2-4 sentences)
- findings: Array of 3-5 specific, detailed insights (each 1-2 full sentences with concrete detail - not a one-line label). Ground each in the location's known environmental context (e.g. named rivers, land cover types, seasonal patterns) rather than generic statements.
- locations: Array of location objects with {name: string, lat: number, lng: number} - name should be a real, geocodable place (e.g. "Accra, Ghana", not a vague description). lat/lng are your best estimate only; they are a fallback, not the primary source of truth, since coordinates are re-verified against a real geocoding service after your response.
- confidenceLevel: 1-100 scale, reflecting how well the query maps to a real, locatable place and known environmental patterns
- recommendations: Array of 3-5 specific, actionable next steps (each naming a concrete action, responsible actor, or monitoring approach - not generic advice like "monitor the situation")`;

    const userPrompt = `Interpret this environmental search query: "${query}"

Provide insights about environmental changes in African regions, including deforestation, flooding, drought, urbanization, or climate impacts.
Consider satellite data availability and relevance. Be specific and detailed rather than generic - this analysis will be used in a professional report.`;

    // Call Google Gemini API with model fallback chain for resilience to overload
    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 2000,
        responseMimeType: "application/json",
      },
    });

    const modelChain = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
    let aiResponse: Response | null = null;
    const attemptsPerModel = 2;

    outer: for (const model of modelChain) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
        aiResponse = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
        if (aiResponse.ok) {
          console.log(`AI success on model ${model}`);
          break outer;
        }
        const errText = await aiResponse.text();
        console.error(`AI API error on ${model} (attempt ${attempt}):`, aiResponse.status, errText.slice(0, 200));
        const isRetryable = aiResponse.status === 503 || aiResponse.status === 429 || aiResponse.status === 500;
        if (!isRetryable) break outer;
        if (attempt < attemptsPerModel) {
          await new Promise((r) => setTimeout(r, 800 * attempt + Math.random() * 400));
        }
      }
    }

    if (!aiResponse || !aiResponse.ok) {
      const status = aiResponse?.status || 500;
      if (status === 503) {
        return new Response(
          JSON.stringify({ error: "Google Gemini is temporarily overloaded. Please try again in a minute." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    let interpretation = aiData.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';

    // Strip markdown code blocks if present
    interpretation = interpretation.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // Try to parse as JSON if structured, otherwise use as text
    let structuredResult;
    try {
      structuredResult = JSON.parse(interpretation);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      structuredResult = {
        interpretation: interpretation.split('\n\n')[0],
        findings: interpretation.split('\n').filter((line: string) => line.trim().startsWith('-') || line.trim().startsWith('•')),
        locations: [],
        confidenceLevel: 75,
        recommendations: [],
      };
    }

    const rawLocations = Array.isArray(structuredResult.locations) ? structuredResult.locations : [];
    const locations = await resolveLocations(rawLocations);

    const result = {
      query,
      interpretation: structuredResult.interpretation || interpretation,
      findings: structuredResult.findings || [],
      locations,
      confidenceLevel: structuredResult.confidenceLevel || 85,
      recommendations: structuredResult.recommendations || [],
      timestamp: new Date().toISOString(),
    };

    // Store in database if authenticated user
    if (user) {
      await supabase.from("search_queries").insert({
        user_id: user.id,
        query: query,
        ai_interpretation: result.interpretation,
        results: {
          findings: result.findings,
          locations: result.locations,
          recommendations: result.recommendations,
        },
        confidence_level: result.confidenceLevel,
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in process-search:", error);
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
