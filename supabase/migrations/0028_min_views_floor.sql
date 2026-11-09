-- GET PAID TO POST — min-views floor of 1,000 per clip (0028)
--
-- 2026-11-10, Turn's decision: a creator needs at least 1,000 views
-- on a clip before it can earn — a site-wide floor, not a brand-set
-- option. Migration 0025 created campaigns.min_views with default 0
-- ("no threshold"); that is replaced here:
--
-- - the default becomes 1000, so a campaign created without a
--   min_views value gets the 1,000 floor;
-- - every existing row below 1,000 is backfilled to 1,000 (zero
--   campaigns exist live, so this is safe);
-- - the CHECK constraint campaigns_min_views_check is replaced:
--   min_views >= 1000 instead of >= 0.
--
-- Run once in the Supabase SQL Editor.

alter table public.campaigns
  alter column min_views set default 1000;

-- Backfill: any row below the floor (including the old 0 = "no
-- threshold" default) is raised to 1,000.
update public.campaigns
set min_views = 1000
where min_views < 1000;

-- Replace the CHECK constraint (idempotent: safe to re-run — the
-- old constraint is dropped only when it exists, and the new one
-- is added only when it is not already there).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'campaigns_min_views_check'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      drop constraint campaigns_min_views_check;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_min_views_check'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_min_views_check check (min_views >= 1000);
  end if;
end $$;
