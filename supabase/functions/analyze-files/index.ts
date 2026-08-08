import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation helpers
const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_REPORT_TYPES = ['simple', 'professional'];

interface FileInput {
  name: string;
  type: string;
  size: number;
  data: string;
}

function validateFiles(value: unknown): FileInput[] {
  if (!Array.isArray(value)) {
    throw new Error('Files must be an array');
  }
  if (value.length === 0) {
    throw new Error('At least one file is required');
  }
  if (value.length > MAX_FILES) {
    throw new Error(`Maximum ${MAX_FILES} files allowed`);
  }
  
  const validatedFiles: FileInput[] = [];
  
  for (let i = 0; i < value.length; i++) {
    const file = value[i];
    if (typeof file !== 'object' || file === null) {
      throw new Error(`File at index ${i} is invalid`);
    }
    
    const f = file as Record<string, unknown>;
    
    if (typeof f.name !== 'string' || f.name.trim().length === 0) {
      throw new Error(`File at index ${i} must have a valid name`);
    }
    if (f.name.length > 255) {
      throw new Error(`File name at index ${i} must be 255 characters or less`);
    }
    
    if (typeof f.type !== 'string') {
      throw new Error(`File at index ${i} must have a valid type`);
    }
    
    if (typeof f.size !== 'number' || f.size <= 0) {
      throw new Error(`File at index ${i} must have a valid size`);
    }
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new Error(`File "${f.name}" exceeds maximum size of ${MAX_FILE_SIZE_MB}MB`);
    }
    
    if (typeof f.data !== 'string' || f.data.length === 0) {
      throw new Error(`File at index ${i} must have valid data`);
    }
    // Limit base64 data size (roughly 1.37x the file size)
    const maxBase64Size = MAX_FILE_SIZE_MB * 1024 * 1024 * 1.4;
    if (f.data.length > maxBase64Size) {
      throw new Error(`File "${f.name}" data exceeds maximum allowed size`);
    }
    
    validatedFiles.push({
      name: f.name.trim(),
      type: f.type,
      size: f.size,
      data: f.data,
    });
  }
  
  return validatedFiles;
}

function validateReportType(value: unknown): string {
  if (typeof value !== 'string') {
    return 'simple'; // Default
  }
  const normalized = value.toLowerCase().trim();
  if (!ALLOWED_REPORT_TYPES.includes(normalized)) {
    throw new Error(`Report type must be one of: ${ALLOWED_REPORT_TYPES.join(', ')}`);
  }
  return normalized;
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
    const files = validateFiles(body.files);
    const reportType = validateReportType(body.reportType);
    
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY not configured");
    }

    console.log(`Analyzing ${files.length} files with report type: ${reportType} for user ${user?.id || 'anonymous'}`);

    // Prepare file descriptions for AI
    const fileDescriptions = files.map((f) => ({
      name: f.name,
      type: f.type,
      size: `${(f.size / 1024).toFixed(1)} KB`,
    }));

    // For images, we'll use the vision capability
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const dataFiles = files.filter((f) => !f.type.startsWith("image/"));

    const isSimple = reportType === "simple";

    const systemPrompt = `You are an expert environmental scientist and geospatial analyst. 
You analyze satellite imagery, environmental data, and geospatial files to provide comprehensive environmental assessments.

${isSimple ? `
IMPORTANT: Generate a SIMPLE, easy-to-understand report that anyone can understand.
- Use plain language, avoid technical jargon
- Explain findings as if talking to a community member
- Focus on practical implications
- Keep explanations short and clear
` : `
IMPORTANT: Generate a PROFESSIONAL technical report suitable for scientists and policymakers.
- Use proper scientific terminology
- Include detailed methodology references
- Provide quantitative metrics where possible
- Reference standard environmental indices (NDVI, NDWI, etc.)
`}

Return your analysis as JSON with this structure:
{
  "summary": "Overall summary of findings",
  "findings": ["finding 1", "finding 2", ...],
  "detailedAnalysis": "Full detailed analysis text",
  "recommendations": ["recommendation 1", "recommendation 2", ...],
  "confidenceLevel": number (1-100),
  "dataSources": ["source 1", "source 2", ...],
  "methodology": "Brief methodology description",
  "severity": "low|medium|high|critical"
}`;

    // Build OpenAI-style message content for Groq
    const userContent: any[] = [];
    if (imageFiles.length > 0) {
      userContent.push({
        type: "text",
        text: `Analyze these environmental/geospatial files for environmental changes and patterns:

Files being analyzed:
${fileDescriptions.map((f) => `- ${f.name} (${f.type}, ${f.size})`).join('\n')}

Please provide a comprehensive ${isSimple ? 'simple, easy-to-understand' : 'professional technical'} analysis.`
      });

      // Add images as image_url data URIs (limit to first 3 - matches Groq's per-request image cap)
      for (const img of imageFiles.slice(0, 3)) {
        // img.data may already be a data URL like "data:image/png;base64,XXXX"
        let mimeType = img.type;
        let base64Data = img.data;
        const dataUrlMatch = img.data.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUrlMatch) {
          mimeType = dataUrlMatch[1];
          base64Data = dataUrlMatch[2];
        }
        userContent.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64Data}` },
        });
      }
    } else {
      const sampleData = dataFiles.length > 0 ? dataFiles[0].data.substring(0, 500) : '';
      userContent.push({
        type: "text",
        text: `Analyze these environmental/geospatial data files:

Files being analyzed:
${fileDescriptions.map((f) => `- ${f.name} (${f.type}, ${f.size})`).join('\n')}

${sampleData ? `Sample data from first file: ${sampleData}...` : ''}

Please provide a comprehensive ${isSimple ? 'simple, easy-to-understand' : 'professional technical'} environmental analysis based on typical patterns and implications of this type of data.`
      });
    }

    // Call Groq's chat completions API with a model fallback chain for resilience to overload.
    // Vision-capable models are required when images are attached; text-only
    // requests can use the faster/cheaper general-purpose chain.
    const requestParams = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 3000,
      response_format: { type: "json_object" },
    };

    const modelChain = imageFiles.length > 0
      ? ["meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"]
      : ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];
    let aiResponse: Response | null = null;
    const attemptsPerModel = 2;
    // Bounds worst-case latency - 4 models x 2 attempts against a degraded/
    // rate-limited key can otherwise compound to 40-90s of real network
    // round-trips, long enough that a waiting user assumes the app is broken.
    const retryDeadline = Date.now() + 18000;

    outer: for (const model of modelChain) {
      if (Date.now() > retryDeadline) {
        console.warn("Groq retry time budget exceeded, stopping early.");
        break outer;
      }
      for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
        if (Date.now() > retryDeadline) break outer;
        // Each attempt also gets its own timeout - the overall deadline only
        // gates whether a NEW attempt starts, so a single slow in-flight
        // request could otherwise still run long past it.
        const perRequestTimeoutMs = Math.min(8000, Math.max(2000, retryDeadline - Date.now()));
        const requestController = new AbortController();
        const requestTimeoutId = setTimeout(() => requestController.abort(), perRequestTimeoutMs);
        try {
          aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({ model, ...requestParams }),
            signal: requestController.signal,
          });
        } catch (e) {
          console.error(`AI request to ${model} timed out or failed (attempt ${attempt}):`, e instanceof Error ? e.message : e);
          aiResponse = null;
          continue;
        } finally {
          clearTimeout(requestTimeoutId);
        }
        if (aiResponse.ok) {
          console.log(`AI success on model ${model}`);
          break outer;
        }
        const errText = await aiResponse.text();
        console.error(`AI API error on ${model} (attempt ${attempt}):`, aiResponse.status, errText.slice(0, 200));
        const isRetryable = aiResponse.status === 503 || aiResponse.status === 429 || aiResponse.status === 500;
        if (!isRetryable) break outer;
        if (attempt < attemptsPerModel && Date.now() < retryDeadline) {
          await new Promise((r) => setTimeout(r, 800 * attempt + Math.random() * 400));
        }
      }
    }

    if (!aiResponse || !aiResponse.ok) {
      const status = aiResponse?.status || 500;
      if (status === 503) {
        return new Response(
          JSON.stringify({ error: "Groq is temporarily overloaded. Please try again in a minute." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI API error: ${status}`);
    }

    const aiData = await aiResponse.json();
    let analysis = aiData.choices?.[0]?.message?.content || '';

    // Strip markdown code blocks if present
    analysis = analysis.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // Parse the AI response
    let parsedAnalysis;
    try {
      parsedAnalysis = JSON.parse(analysis);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      parsedAnalysis = {
        summary: analysis.split('\n\n')[0] || "Analysis complete",
        findings: [],
        detailedAnalysis: analysis,
        recommendations: [],
        confidenceLevel: 80,
        dataSources: ["Uploaded files"],
        methodology: "AI-powered file analysis",
        severity: "medium"
      };
    }

    const result = {
      ...parsedAnalysis,
      filesAnalyzed: fileDescriptions,
      reportType,
      timestamp: new Date().toISOString(),
      // Computed here rather than trusting the model's own self-reported
      // "dataSources" - images are genuinely seen by the model's vision input,
      // but non-image files are only sampled as 500 chars of text and the
      // model is explicitly instructed to generalize from typical patterns,
      // not to have actually read/parsed the file's real content.
      dataProvenance: {
        analysisMethod: imageFiles.length > 0 ? "ai_vision_analysis" : "ai_pattern_estimation",
        disclaimer: imageFiles.length > 0
          ? "Image files in this batch were directly viewed by the AI model. Any non-image files included were not read in detail - see below."
          : "No image was uploaded, so the AI did not read this file's actual content in detail - it generated a plausible analysis based on typical patterns for this file type and a short text sample only. Treat these findings as illustrative, not a real analysis of your data.",
      },
    };

    // Store in database if authenticated user
    if (user) {
      await supabase.from("search_queries").insert({
        user_id: user.id,
        query: `File analysis: ${fileDescriptions.map((f) => f.name).join(', ')}`,
        ai_interpretation: result.summary,
        results: {
          findings: result.findings,
          recommendations: result.recommendations,
          filesAnalyzed: fileDescriptions,
        },
        confidence_level: result.confidenceLevel,
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in analyze-files:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const status = errorMessage.includes("required") || errorMessage.includes("must be") || errorMessage.includes("exceeds") ? 400 : 500;
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
