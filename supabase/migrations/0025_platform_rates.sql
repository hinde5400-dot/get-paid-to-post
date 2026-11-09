-- GET PAID TO POST — per-platform rates, min views, per-creator cap (0025)
--
-- P1-b (2026-11-09, Content Rewards model): a campaign can pay a
-- different rate per platform (e.g. TikTok $1.50/1k, YouTube $2.00/1k),
-- set a minimum-views threshold per clip, and cap what one creator
-- can earn from the campaign in total.
--
-- - `rates` JSONB: {"tiktok": 1.5, "instagram": 1.5, "youtube": 2.0}
--   (rate per 1,000 views, per platform). The legacy `rate_per_1m` /
--   `view_bonus_per_1k` columns stay as the fallback: they hold the
--   first selected platform's rate, so old campaigns and old code
--   paths keep working. A platform missing from `rates` falls back
--   to the legacy rate.
-- - `min_views` integer, default 0 = NO threshold. Turn never chose
--   a site-wide number, so nothing is imposed — the brand sets one
--   per campaign, or leaves it at 0.
-- - `max_payout_per_creator` numeric, NULL = NO cap. Same: the brand
--   sets one per campaign, or leaves it unset. This is the MONEY cap
--   on top of the existing 15-approved-clips-per-platform count cap.
--
-- Run once in the Supabase SQL Editor.

alter table public.campaigns
  add column if not exists rates jsonb not null default '{}'::jsonb;

alter table public.campaigns
  add column if not exists min_views integer not null default 0;

alter table public.campaigns
  add column if not exists max_payout_per_creator numeric;

-- Guards (idempotent: skipped when the constraint already exists).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_min_views_check'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_min_views_check check (min_views >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_max_payout_per_creator_check'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_max_payout_per_creator_check
      check (max_payout_per_creator is null or max_payout_per_creator > 0);
  end if;
end $$;

-- Backfill: legacy rows get one rate per platform from the legacy
-- single rate (view_bonus_per_1k), so their `rates` match what the
-- old code already paid. Only rows whose rates are still empty.
update public.campaigns c
set rates = (
  select jsonb_object_agg(p, c.view_bonus_per_1k)
  from unnest(coalesce(c.platforms, array['tiktok'])) as p
)
where c.rates = '{}'::jsonb
  and c.view_bonus_per_1k is not null
  and c.view_bonus_per_1k > 0;
