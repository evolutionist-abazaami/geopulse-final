-- Automates the Early Warning pipeline: previously, weather data only got
-- ingested and hazard thresholds only got evaluated when someone opened the
-- Early Warning page and clicked the two manual buttons - meaning nothing
-- actually monitored anything in the background. This schedules both steps
-- to run continuously via pg_cron + pg_net, so alerts can fire even when no
-- one is looking at the app.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Real weather observations every 30 minutes (Open-Meteo, free/keyless).
select cron.schedule(
  'geopulse-ingest-weather',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://xkeqcbwzyxqjahcezvtp.supabase.co/functions/v1/ingest-weather',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Threshold evaluation every 15 minutes, offset 5 minutes after each
-- ingestion run so fresh observations are normally available to evaluate.
select cron.schedule(
  'geopulse-evaluate-hazards',
  '5,20,35,50 * * * *',
  $$
  select net.http_post(
    url := 'https://xkeqcbwzyxqjahcezvtp.supabase.co/functions/v1/evaluate-hazards',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
