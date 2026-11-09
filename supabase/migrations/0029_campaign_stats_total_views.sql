-- GET PAID TO POST — campaign_stats total_views (0029)
--
-- Adds total_views (sum of views across all submissions on the
-- campaign) to the SECURITY DEFINER public.campaign_stats function,
-- so a brand can see total views on its own dashboard. Submissions
-- are RLS-locked to their creator (plus the owner), so a brand
-- cannot sum them directly from the client.
--
-- The return type changes, so the function must be DROPPED first:
-- CREATE OR REPLACE cannot change a function's return type.
-- Run once in the Supabase SQL Editor. The app reads total_views
-- only when the function returns it, so the site stays correct
-- before this migration is run (the brand dashboard shows "—"
-- for views until then, never a fake 0).

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
    count(*) filter (where created_at >= now() - interval '30 days')::bigint,
    coalesce(sum(views), 0)::bigint
  from public.submissions
  where campaign_id = p_campaign_id;
$$;

grant execute on function public.campaign_stats(uuid) to anon, authenticated;
