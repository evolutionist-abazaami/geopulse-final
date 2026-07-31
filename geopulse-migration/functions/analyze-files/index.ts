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
    const files = validateFiles(body.files);
    const reportType = validateReportType(body.reportType);
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    console.log(`Analyzing ${files.length} files with report type: ${reportType} for user ${user.id}`);

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

    // Build Gemini contents
    const userParts: any[] = [];
    if (imageFiles.length > 0) {
      userParts.push({
        text: `Analyze these environmental/geospatial files for environmental changes and patterns:

Files being analyzed:
${fileDescriptions.map((f) => `- ${f.name} (${f.type}, ${f.size})`).join('\n')}

Please provide a comprehensive ${isSimple ? 'simple, easy-to-understand' : 'professional technical'} analysis.`
      });

      // Add images as inline_data (limit to first 3)
      for (const img of imageFiles.slice(0, 3)) {
        // img.data may be a data URL like "data:image/png;base64,XXXX"
        let mimeType = img.type;
        let base64Data = img.data;
        const dataUrlMatch = img.data.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUrlMatch) {
          mimeType = dataUrlMatch[1];
          base64Data = dataUrlMatch[2];
        }
        userParts.push({
          inline_data: { mime_type: mimeType, data: base64Data }
        });
      }
    } else {
      const sampleData = dataFiles.length > 0 ? dataFiles[0].data.substring(0, 500) : '';
      userParts.push({
        text: `Analyze these environmental/geospatial data files:

Files being analyzed:
${fileDescriptions.map((f) => `- ${f.name} (${f.type}, ${f.size})`).join('\n')}

${sampleData ? `Sample data from first file: ${sampleData}...` : ''}

Please provide a comprehensive ${isSimple ? 'simple, easy-to-understand' : 'professional technical'} environmental analysis based on typical patterns and implications of this type of data.`
      });
    }

    // Call Google Gemini API with model fallback chain for resilience to overload
    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: userParts }],
      generationConfig: {
        maxOutputTokens: 3000,
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
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI API error: ${status}`);
    }

    const aiData = await aiResponse.json();
    let analysis = aiData.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';

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
    };

    // Store in database with authenticated user
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
