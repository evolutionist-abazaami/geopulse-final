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
    
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const query = validateQuery(body.query);
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    console.log(`Processing search query for user ${user.id}: ${query.substring(0, 100)}...`);

    // Prepare system prompt for natural language search
    const systemPrompt = `You are an AI assistant specialized in geospatial search and environmental data interpretation.
Your role is to:
1. Interpret natural language queries about environmental changes across Africa
2. Extract key information: location, event type, time period, specific concerns
3. Provide relevant satellite data insights with REAL coordinates
4. Suggest monitoring strategies and data sources
5. Assess confidence levels based on data availability

Format responses as structured JSON with:
- interpretation: Clear explanation of what the user is looking for
- findings: Array of relevant environmental insights
- locations: Array of location objects with {name: string, lat: number, lng: number, boundary?: [[lat,lng][]]}
- confidenceLevel: 1-100 scale
- recommendations: Actionable next steps

IMPORTANT: Always provide real geographic coordinates for locations mentioned in Africa.`;

    const userPrompt = `Interpret this environmental search query: "${query}"

Provide insights about environmental changes in African regions, including deforestation, flooding, drought, urbanization, or climate impacts.
Consider satellite data availability and relevance.`;

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

    const result = {
      query,
      interpretation: structuredResult.interpretation || interpretation,
      findings: structuredResult.findings || [],
      locations: structuredResult.locations || [],
      confidenceLevel: structuredResult.confidenceLevel || 85,
      recommendations: structuredResult.recommendations || [],
      timestamp: new Date().toISOString(),
    };

    // Store in database with authenticated user
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
