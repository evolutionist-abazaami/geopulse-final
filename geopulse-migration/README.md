# GeoPulse — Self-Hosting Migration Package

Everything needed to run GeoPulse on your own Supabase project (hosted or
self-hosted) with no dependency on Lovable.

```
geopulse-migration/
├── 01_schema_and_rls.sql     # full schema, functions, GRANTs, RLS policies
├── 02_storage.sql            # demo-recordings bucket + storage.objects policies
├── migrations/               # the same SQL split into 12 ordered CLI migrations
├── functions/                # all 7 Edge Functions (Deno source)
├── .env.example              # every environment variable, frontend + server
├── AUTH_MIGRATION.md         # Lovable Cloud Auth → standard Supabase Auth
└── LOVABLE_DEPENDENCIES.md   # what to delete from the app code
```

## Database objects covered

**11 tables** — `alert_preferences`, `analysis_results`, `chat_messages`,
`comparison_results`, `demo_recordings`, `hazard_alerts`,
`monitoring_thresholds`, `saved_locations`, `search_queries`,
`shared_reports`, `weather_observations`.

**2 functions** — `increment_shared_report_view(text)` (SECURITY DEFINER,
used by public share links) and `update_updated_at_column()` (timestamp trigger).

**RLS** is enabled on every table. All user data is scoped with
`auth.uid() = user_id`. Two deliberate exceptions:
`weather_observations` is world-readable (service-role writes only), and
`shared_reports` / public `demo_recordings` are readable by anyone holding the
`share_id` while `is_active` and unexpired.

## Migration steps

### 1. Create the project

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
```

### 2. Apply the schema

Either with the CLI (recommended — keeps migration history):

```bash
cp -r migrations/* supabase/migrations/
supabase db push
```

or paste `01_schema_and_rls.sql` then `02_storage.sql` into the SQL editor.

### 3. Deploy Edge Functions

```bash
cp -r functions/* supabase/functions/
supabase functions deploy analyze-satellite process-search analyze-files \
  generate-visualization ai-assistant ingest-weather evaluate-hazards \
  --no-verify-jwt
```

`--no-verify-jwt` matches the current config; each function validates the JWT
in code where it needs a user.

### 4. Set secrets

```bash
supabase secrets set GEMINI_API_KEY=... GOOGLE_EARTH_ENGINE_API_KEY=...
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_DB_URL` are injected automatically. Do **not** set `LOVABLE_API_KEY`.

### 5. Point the frontend at your project

Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

### 6. Auth

Follow `AUTH_MIGRATION.md` (Google OAuth credentials, redirect URLs, user
export, and the one code change in `src/pages/Auth.tsx`).

### 7. Strip Lovable

Follow `LOVABLE_DEPENDENCIES.md` (2 npm packages, 1 folder, 2 small diffs).

### 8. Move existing data (optional)

Table data is not included here. Export per table from the current project and
import in the same order as the schema, respecting `user_id` values — they must
match the migrated `auth.users` ids or RLS will hide every row.

```bash
# example, per table
\copy public.saved_locations TO 'saved_locations.csv' CSV HEADER   -- source
\copy public.saved_locations FROM 'saved_locations.csv' CSV HEADER -- target
```

Import order: users first, then `saved_locations`, `monitoring_thresholds`,
`alert_preferences`, `analysis_results`, `search_queries`, `comparison_results`,
`shared_reports`, `demo_recordings`, `weather_observations`, `hazard_alerts`
(it references `monitoring_thresholds`), `chat_messages`.

Storage objects in `demo-recordings` must be re-uploaded under the same
`<user_id>/<filename>` paths for the policies to match.

## External services you must own

| Service | Used by | Key |
|---|---|---|
| Google Gemini | all AI features | `GEMINI_API_KEY` |
| Google Earth Engine | satellite/Landsat analysis | `GOOGLE_EARTH_ENGINE_API_KEY` |
| Open-Meteo | weather ingest, hazard evaluation | none (free, keyless) |
| Nominatim / OSM | geocoding | none (respect usage policy; self-host for volume) |
| MapLibre + Terrarium DEM tiles | map rendering | none |

None of these are proxied through Lovable — the app calls them directly.
