-- Cron callers use the shared secret stored in Supabase Vault. Rotate
-- CRON_SHARED_SECRET out of band in both Vault and the Edge Function config.
-- The secret is looked up when each scheduled request is sent.

select cron.schedule(
  'geopulse-ingest-weather',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://xkeqcbwzyxqjahcezvtp.supabase.co/functions/v1/ingest-weather',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
