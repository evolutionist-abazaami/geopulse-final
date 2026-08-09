import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeUserOrCron } from "../_shared/auth.ts";

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

interface MonitoringLocation {
  name: string;
  lat: number;
  lng: number;
}

const MAX_LOCATIONS = 20;

function validateLocations(value: unknown): MonitoringLocation[] {
  if (!Array.isArray(value)) {
    throw new Error("locations must be an array");
  }
  if (value.length === 0) {
    throw new Error("locations must contain at least one entry");
  }
  if (value.length > MAX_LOCATIONS) {
    throw new Error(`locations must contain ${MAX_LOCATIONS} entries or fewer`);
  }

  return value.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`locations[${i}] is invalid`);
    }
    const loc = entry as Record<string, unknown>;
    if (typeof loc.name !== "string" || loc.name.trim().length === 0) {
      throw new Error(`locations[${i}] must have a valid name`);
    }
    if (loc.name.length > 200) {
      throw new Error(`locations[${i}].name must be 200 characters or less`);
    }
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new Error(`locations[${i}].lat must be a number between -90 and 90`);
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new Error(`locations[${i}].lng must be a number between -180 and 180`);
    }
    return { name: loc.name.trim(), lat, lng };
  });
}

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

    if (!(await authorizeUserOrCron(req, supabase))) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Accept optional locations from request body, otherwise use defaults
    let locations: MonitoringLocation[] = DEFAULT_MONITORING_LOCATIONS;
    try {
      const body = await req.json();
      if (body?.locations !== undefined) {
        locations = validateLocations(body.locations);
      }
    } catch (parseError) {
      if (parseError instanceof Error && parseError.message.startsWith("locations")) {
        throw parseError;
      }
      // No/invalid JSON body at all (not a locations-validation failure) - use defaults.
    }

    // Each location's fetch+insert is independent, so run them concurrently
    // rather than one-at-a-time - this matters more now that a pg_cron job
    // calls this function on a timer with its own timeout to respect.
    const outcomes = await Promise.all(
      locations.map(async (location) => {
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

          return error
            ? { ok: false as const, location: location.name, error: error.message }
            : { ok: true as const, location: location.name, data: observation };
        } catch (err) {
          return { ok: false as const, location: location.name, error: err instanceof Error ? err.message : "Unknown error" };
        }
      })
    );

    const results: { location: string; status: string; data: Record<string, unknown> }[] = [];
    const errors: { location: string; error: string }[] = [];
    for (const outcome of outcomes) {
      if (outcome.ok) {
        results.push({ location: outcome.location, status: "success", data: outcome.data });
      } else {
        errors.push({ location: outcome.location, error: outcome.error });
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const status = errorMessage.startsWith("locations") ? 400 : 500;
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
