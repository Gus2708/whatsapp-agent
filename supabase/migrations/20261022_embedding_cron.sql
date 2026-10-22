-- Every minute, call embed-productos only when there is pending work.
-- Rows that failed MAX_INTENTOS (5) times are skipped until a new change re-queues them
-- (the trigger resets intentos). Inspect them with:
--   select * from embedding_cola where intentos >= 5;
select cron.unschedule('embed-productos-1m')
where exists (select 1 from cron.job where jobname = 'embed-productos-1m');

select cron.schedule(
  'embed-productos-1m',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://rgniqjfooifchyctnbzu.supabase.co/functions/v1/embed-productos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (select 1 from public.embedding_cola where intentos < 5);
  $$
);
