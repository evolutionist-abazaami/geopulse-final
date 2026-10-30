# GeoPulse

GeoPulse is a geospatial environmental monitoring application. It combines
satellite measurements, weather observations, geocoding, and
model-generated explanations while keeping measurement provenance explicit.

## Data flow and provenance

- **Location search:** place names and coordinates come from an explicit
  Nominatim/OpenStreetMap search. Returned GeoJSON boundaries are used for
  map outlines and polygon-based analysis; results without a boundary are
  explicitly point locations. No model-generated coordinates or environmental
  search findings are accepted. Nominatim is a community service with a strict
  usage policy and no application-wide rate limit in this prototype; see
  [`docs/DATA_SOURCES.md`](./docs/DATA_SOURCES.md) before increasing traffic.
- **Satellite measurements:** `analyze-satellite` requests Sentinel-2 MSI L2A
  statistics for studies starting on or after June 23, 2015. Older study
  periods use the date-appropriate Landsat Collection 2 Level-2 collection
  (TM, ETM+, or OLI-TIRS) through Google Earth Engine. Historical Landsat
  statistics require an Earth Engine-enabled Google Cloud project and a
  service account; Sentinel-2 continues to use the Copernicus Data Space
  credentials. The earliest supported Landsat Level-2 date is August 1982.
  The selected sensor is reported with the results; cross-mission comparisons
  are identified rather than presented as same-sensor measurements. The AOI is
  approximately 11 km across (±0.05° around the selected point), or uses the
  supplied selected boundary, aggregated on a 128×128 statistics grid.
  Boundary results are regional aggregates, not fine-grained affected-area
  maps. Sentinel-2 scenes are limited to 60% cloud
  coverage; Landsat cloud and quality flags are masked at the pixel level.
  Sentinel-2 SCL classes 3, 8, 9, and 10 are masked; Landsat Collection 2
  fill, dilated cloud, cirrus, cloud, shadow, and snow QA flags are masked.
  Landsat surface-reflectance scale and offset are applied before computing
  spectral indices.
- **Measured versus generated output:** NDVI, NDWI, NBR, valid-pixel ratio,
  change, and supported trend calculations come from satellite statistics.
  When those measurements are unavailable, numeric satellite fields are null.
  Groq-generated narrative is separately identified; its percentages and
  index-like values are checked against measurements, retried once, and
  replaced with a deterministic summary if mismatches remain.
- **Narrative model availability:** `analyze-satellite` rotates to another
  configured Groq model when a model ID is unavailable. Keep its model list
  aligned with Groq's active model catalog as models are deprecated.
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

## GIS import and export

The map's Import GIS Data tool accepts Shapefile components (`.shp` and
optional `.dbf`/`.prj`) and GeoJSON. Imported points, lines, and polygons are
rendered on the map; a `.prj` file is used to reproject shapefile coordinates
to WGS84 for display. The GeoTIFF button on the map toolbar exports the current
flat, north-up map view as a georeferenced EPSG:3857 raster that can be opened
in QGIS, ArcGIS, and other GIS software. Vector feature exports remain
available separately as Shapefile, GeoJSON, or KML.

## Environment variables

Set values in the appropriate Supabase project settings and local frontend
environment. Never commit `.env` files or secret values.

### Frontend

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase client key |
| `VITE_ENABLE_DEMO_RECORDER` | Optional demo recorder feature flag |
| `VITE_MAP_STYLE_URL` | Optional MapLibre style URL (defaults to OpenFreeMap Liberty) |
| `VITE_TERRAIN_TILE_URL` | Optional Terrarium DEM tile URL |

### Supabase Edge Functions

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public key used by the assistant function's Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database access for Edge Functions |
| `GROQ_API_KEY` | Generated analysis, assistant, and hazard narratives |
| `SENTINELHUB_CLIENT_ID` | Sentinel Hub client credentials for measured imagery/statistics |
| `SENTINELHUB_CLIENT_SECRET` | Sentinel Hub client credentials for measured imagery/statistics |
| `EARTH_ENGINE_PROJECT_ID` | Google Cloud project registered for Earth Engine |
| `EARTH_ENGINE_SERVICE_ACCOUNT_JSON` | Service-account key JSON for server-side Earth Engine requests |
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
