# GeoPulse

GeoPulse is a geospatial environmental monitoring application. It combines
Sentinel-2 satellite measurements, weather observations, geocoding, and
model-generated explanations while keeping measurement provenance explicit.

## Data flow and provenance

- **Location search:** `process-search` uses Groq to interpret a query and
  Nominatim/OpenStreetMap to verify place coordinates. If geocoding fails,
  model-provided coordinates are retained only with an unverified
  `ai_estimate` label. Search confidence is model-generated, not a measurement.
- **Satellite measurements:** `analyze-satellite` requests Sentinel-2 MSI L2A
  statistics from the Copernicus Data Space Sentinel Hub API. The AOI is
  approximately 11 km across (±0.05° around the selected point), aggregated on
  a 128×128 statistics grid. Scenes are limited to 60% cloud coverage and
  Sentinel-2 SCL classes 3, 8, 9, and 10 are masked.
- **Measured versus generated output:** NDVI, NDWI, NBR, valid-pixel ratio,
  change, and supported trend calculations come from satellite statistics.
  When those measurements are unavailable, numeric satellite fields are null.
  Groq-generated narrative is separately identified; its percentages and
  index-like values are checked against measurements, retried once, and
  replaced with a deterministic summary if mismatches remain.
- **Visualizations:** `generate-visualization` prefers Sentinel Hub imagery.
  Gemini-generated fallback illustrations are not satellite measurements and
  must be interpreted as generated visuals.
- **Weather and alerts:** `ingest-weather` stores Open-Meteo observations and
  the returned daily data. Open-Meteo `current.rain` is the preceding-interval
  value, not a daily accumulation. Thresholds can use `daily_rain_sum` to read
  the matching date's `daily.rain_sum`.
- **Sharing:** Shared reports are retrieved through the restricted
  `get_shared_report` RPC, which returns only active, unexpired reports.

Analysis constants and the corresponding test coverage are summarized in
[`docs/PAPER_CLAIMS.md`](./docs/PAPER_CLAIMS.md). No manuscript document was
included in this repository snapshot, so that ledger is a code-based reference,
not a completed sentence-by-sentence manuscript audit.

## Environment variables

Set values in the appropriate Supabase project settings and local frontend
environment. Never commit `.env` files or secret values.

### Frontend

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase client key |
| `VITE_ENABLE_DEMO_RECORDER` | Optional demo recorder feature flag |

### Supabase Edge Functions

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public key used by the assistant function's Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database access for Edge Functions |
| `GROQ_API_KEY` | Generated analysis, assistant, search, and hazard narratives |
| `SENTINELHUB_CLIENT_ID` | Sentinel Hub client credentials for measured imagery/statistics |
| `SENTINELHUB_CLIENT_SECRET` | Sentinel Hub client credentials for measured imagery/statistics |
| `GEMINI_API_KEY` | Gemini-generated visualization fallback |
| `CRON_SHARED_SECRET` | Shared authorization value for scheduled Edge Function calls |

`CRON_SHARED_SECRET` must match the value stored in Supabase Vault. Rotate it
manually in Vault and the Edge Function configuration; do not generate or
include a replacement in source control.

## Local development

Requirements: Node.js/npm and Deno.

```sh
npm ci
npm run dev
```

Run the frontend smoke test and production build:

```sh
npm test
npm run build
```

Run Deno tests and type-check the Edge Function entry points:

```sh
deno test supabase/functions
deno check supabase/functions/ai-assistant/index.ts
deno check supabase/functions/analyze-files/index.ts
deno check supabase/functions/analyze-satellite/index.ts
deno check supabase/functions/evaluate-hazards/index.ts
deno check supabase/functions/generate-visualization/index.ts
deno check supabase/functions/ingest-weather/index.ts
deno check supabase/functions/process-search/index.ts
```

GitHub Actions runs the same Deno checks/tests and frontend smoke/build checks.

## Deployment

Apply migrations from `supabase/migrations/` and deploy the functions from
`supabase/functions/` using the Supabase CLI. Configure the environment
variables above before enabling scheduled jobs.

The `geopulse-migration/` directory contains historical migration artifacts;
the active functions and migrations are under `supabase/`.
