import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// African cities to monitor by default
const DEFAULT_MONITORING_LOCATIONS = [
  { name: "Accra, Ghana", lat: 5.6037, lng: -0.1870 },
  { name: "Lagos, Nigeria", lat: 6.5244, lng: 3.3792 },
  { name: "Nairobi, Kenya", lat: -1.2921, lng: 36.8219 },
  { name: "Kumasi, Ghana", lat: 6.6885, lng: -1.6244 },
  { name: "Addis Ababa, Ethiopia", lat: 9.0192, lng: 38.7525 },
  { name: "Dar es Salaam, Tanzania", lat: -6.7924, lng: 39.2083 },
  { name: "Kampala, Uganda", lat: 0.3476, lng: 32.5825 },
  { name: "Lusaka, Zambia", lat: -15.3875, lng: 28.3228 },
];

async function fetchWeatherData(lat: number, lng: number) {
  // Open-Meteo API - free, no API key needed
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,rain,wind_speed_10m,soil_moisture_0_to_7cm&daily=temperature_2m_max,temperature_2m_min,rain_sum,wind_speed_10m_max&timezone=auto&past_days=7&forecast_days=3`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo API error: ${response.status}`);
  }
  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Accept optional locations from request body, otherwise use defaults
    let locations = DEFAULT_MONITORING_LOCATIONS;
    try {
      const body = await req.json();
      if (body?.locations && Array.isArray(body.locations)) {
        locations = body.locations;
      }
    } catch {
      // Use defaults if no body
    }

    const results = [];
    const errors = [];

    for (const location of locations) {
      try {
        const weatherData = await fetchWeatherData(location.lat, location.lng);
        const current = weatherData.current;

        const observation = {
          region_name: location.name,
          lat: location.lat,
          lng: location.lng,
          observation_date: new Date().toISOString(),
          temperature_c: current?.temperature_2m ?? null,
          rainfall_mm: current?.rain ?? null,
          soil_moisture: current?.soil_moisture_0_to_7cm ?? null,
          wind_speed_kmh: current?.wind_speed_10m ?? null,
          humidity_percent: current?.relative_humidity_2m ?? null,
          data_source: "open-meteo",
          raw_data: weatherData,
        };

        const { error } = await supabase
          .from("weather_observations")
          .insert(observation);

        if (error) {
          errors.push({ location: location.name, error: error.message });
        } else {
          results.push({ location: location.name, status: "success", data: observation });
        }
      } catch (err) {
        errors.push({ location: location.name, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ingested: results.length,
        failed: errors.length,
        results,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ingestion error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
