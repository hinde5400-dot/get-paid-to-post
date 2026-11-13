-- 0048: Instagram verification via Apify — store the Apify run
-- id on the row so a run started in the last 5 minutes is reused
-- instead of starting a duplicate (re-clicks, refreshes, and the
-- card's own retries all land on the same run). Turn's order,
-- 2026-11-13: Instagram is never fetched from Vercel any more.
alter table public.verified_profiles
  add column if not exists apify_run_id text,
  add column if not exists apify_run_started_at timestamptz;
