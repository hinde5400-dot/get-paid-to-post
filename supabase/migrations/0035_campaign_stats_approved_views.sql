-- GET PAID TO POST — campaign_stats approved-only views (0035)
--
-- Two silent bugs in the public campaign_stats function (0029):
-- 1) total_views summed views across ALL submissions, including
--    rejected and bot-view clips. A brand pays only for approved
--    views, so the delivery number it judges the campaign by was
--    inflated. Now: approved submissions only.
-- 2) active_30d counted SUBMISSIONS in the last 30 days, not
--    creators — one creator posting 10 clips read as "10 Active".
--    Now: distinct creators with a submission in the last 30 days.
--
-- The return type is unchanged, so CREATE OR REPLACE works; the
-- function is dropped first anyway, following the 0029 pattern.
-- Run once in the Supabase SQL Editor. Until it is run, the live
-- function still returns the old numbers (the app's fallbacks in
-- lib/data.ts are already fixed in code).

drop function if exists public.campaign_stats(uuid);

create or replace function public.campaign_stats(p_campaign_id uuid)
returns table (
  total bigint,
  approved bigint,
  members bigint,
  active_30d bigint,
  total_views bigint
)
language sql
stable
security definer
set search_path = public as $$
  select
    count(*)::bigint,
    count(*) filter (where status = 'approved')::bigint,
    count(distinct user_id)::bigint,
    count(distinct user_id) filter (where created_at >= now() - interval '30 days')::bigint,
    coalesce(sum(views) filter (where status = 'approved'), 0)::bigint
  from public.submissions
  where campaign_id = p_campaign_id;
$$;

grant execute on function public.campaign_stats(uuid) to anon, authenticated;
