-- The previous CRON_SHARED_SECRET value (20260805202609) was committed in
-- plaintext in that migration, in a public repo, so it must be treated as
-- burned. The new value is stored in Supabase Vault (as 'cron_shared_secret',
-- created out-of-band via `supabase db query`, not in any migration) and the
-- matching Edge Function secret was updated via `supabase secrets set
-- CRON_SHARED_SECRET=...` - the value itself never appears in git.
--
-- Both cron jobs are re-scheduled (same job names update in place) to read
-- the secret from vault.decrypted_secrets at execution time instead of
-- carrying a literal value.

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
