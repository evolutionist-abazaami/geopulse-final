-- ingest-weather and evaluate-hazards now require either a real signed-in
-- user (EarlyWarning enforces login) or this shared secret, so a bare
-- function URL can no longer be used to trigger ingestion/evaluation (and
-- the Gemini calls evaluate-hazards makes) for every user. Re-schedule both
-- cron jobs (same job names update in place) to send that secret.

select cron.schedule(
  'geopulse-ingest-weather',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://xkeqcbwzyxqjahcezvtp.supabase.co/functions/v1/ingest-weather',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "474e2908a4bd3f4e054e1e5bf46a2206dfc5832b8fa5ca6c0117b9ec668610de"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'geopulse-evaluate-hazards',
  '5,20,35,50 * * * *',
  $$
  select net.http_post(
    url := 'https://xkeqcbwzyxqjahcezvtp.supabase.co/functions/v1/evaluate-hazards',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "474e2908a4bd3f4e054e1e5bf46a2206dfc5832b8fa5ca6c0117b9ec668610de"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
