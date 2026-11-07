-- GET PAID TO POST — public campaign stats (0003)
-- Read-only SECURITY DEFINER function so campaign cards, the campaign
-- modal and the brand page can show REAL member / active / approval
-- numbers to every viewer. Submissions are otherwise RLS-locked to
-- their owner (plus admins), so without this function public stats
-- cannot be computed from the anon key.
-- Run this file once in the Supabase SQL Editor. The app calls it with
-- a graceful fallback (stats are omitted, never invented) until it is
-- run, so running it is recommended but not blocking.

create or replace function public.campaign_stats(p_campaign_id uuid)
returns table (
  total bigint,
  approved bigint,
  members bigint,
  active_30d bigint
)
language sql
stable
security definer
set search_path = public as $$
  select
    count(*)::bigint,
    count(*) filter (where status = 'approved')::bigint,
    count(distinct user_id)::bigint,
    count(*) filter (where created_at >= now() - interval '30 days')::bigint
  from public.submissions
  where campaign_id = p_campaign_id;
$$;

grant execute on function public.campaign_stats(uuid) to anon, authenticated;
