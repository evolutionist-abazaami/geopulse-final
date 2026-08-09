import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Optional authentication check
    const authHeader = req.headers.get('authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_ANON_KEY') || '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace('Bearer ', '');
      const { data } = await supabase.auth.getUser(token);
      user = data?.user || null;
    }
    console.log('AI Assistant User:', user ? user.id : 'Guest');

    const { messages } = await req.json();

    // Input validation
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (messages.length > 50) {
      return new Response(JSON.stringify({ error: 'Too many messages in conversation' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    const systemPrompt = `You are GeoPulse AI Assistant, an expert in geospatial analysis, environmental monitoring, and satellite imagery interpretation for Africa.

Your expertise includes:
- Environmental change detection (deforestation, floods, droughts, fires)
- Satellite imagery analysis and interpretation
- Climate and weather patterns across Africa
- Land use and urbanization trends
- Conservation and biodiversity monitoring
- Agricultural analysis and crop health assessment

You help users:
1. Understand how to use GeoPulse features (GeoWitness, GeoSearch, Analytics, Dashboard)
2. Interpret analysis results and environmental data
3. Suggest optimal analysis parameters for their research
4. Explain environmental phenomena and their indicators
5. Recommend regions and time periods for specific analyses
6. Provide context about African geography and environmental issues

Be concise, helpful, and provide actionable insights. When discussing locations, be specific about African regions, countries, and areas. Use technical terms when appropriate but explain them clearly.

Current GeoPulse features:
- GeoWitness: Select locations and run AI-powered environmental change analysis
- GeoSearch: Natural language queries for environmental data
- Analytics: Visualize trends and patterns in your analysis history
- Dashboard: View and export your analysis history`;

    // Convert to OpenAI-style messages for Groq's chat completions API
    const recentMessages = messages.slice(-20);
    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Groq's stream is already OpenAI-format SSE (data: {"choices":[{"delta":{"content":...}}]})
    // so it can be piped straight through to the frontend parser unchanged.
    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('AI assistant error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
