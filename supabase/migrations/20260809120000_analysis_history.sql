-- Unified analysis history table for the v2 shell's sidebar history list.
-- Backed by a one-time backfill from analysis_results (GeoWitness) and
-- search_queries (GeoSearch) so existing history isn't invisible on day one.
-- Going forward, the app writes only to this table.

create table if not exists analysis_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('geowitness', 'geosearch')),
  event_type text,
  region_name text not null,
  region_bounds jsonb not null,
  date_range jsonb,
  result_payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table analysis_history enable row level security;

create policy "Users see own history"
  on analysis_history for all
  using (auth.uid() = user_id);

create index if not exists analysis_history_user_created
  on analysis_history (user_id, created_at desc);

-- Backfill from analysis_results. No region_bounds column exists there;
-- synthesize a ~0.15deg bbox around the stored point, matching the
-- boundarySize constant GeoWitness.tsx itself already uses for its result
-- polygon. Rows without usable coordinates are skipped rather than guessed.
insert into analysis_history (user_id, type, event_type, region_name, region_bounds, date_range, result_payload, created_at)
select
  user_id,
  'geowitness',
  event_type,
  region,
  jsonb_build_object(
    'north', (coordinates->>'lat')::float + 0.15,
    'south', (coordinates->>'lat')::float - 0.15,
    'east', (coordinates->>'lng')::float + 0.15,
    'west', (coordinates->>'lng')::float - 0.15
  ),
  jsonb_build_object('start', start_date, 'end', end_date),
  coalesce(ai_analysis, '{}'::jsonb) || jsonb_build_object(
    'region', region,
    'eventType', event_type,
    'changePercent', change_percent,
    'area', area_analyzed,
    'summary', summary,
    'coordinates', coordinates
  ),
  created_at
from analysis_results
where coordinates ? 'lat' and coordinates ? 'lng';

-- Backfill from search_queries. Location lives inside results->locations[0];
-- rows with no usable location are skipped rather than guessed.
insert into analysis_history (user_id, type, region_name, region_bounds, result_payload, created_at)
select
  user_id,
  'geosearch',
  coalesce(results->'locations'->0->>'name', 'Unknown'),
  jsonb_build_object(
    'north', (results->'locations'->0->>'lat')::float + 0.2,
    'south', (results->'locations'->0->>'lat')::float - 0.2,
    'east', (results->'locations'->0->>'lng')::float + 0.2,
    'west', (results->'locations'->0->>'lng')::float - 0.2
  ),
  coalesce(results, '{}'::jsonb) || jsonb_build_object(
    'query', query,
    'interpretation', ai_interpretation,
    'confidenceLevel', confidence_level
  ),
  created_at
from search_queries
where results->'locations'->0->>'lat' is not null
  and results->'locations'->0->>'lng' is not null;
