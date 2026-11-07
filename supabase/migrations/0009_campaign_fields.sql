-- GET PAID TO POST — campaign brief, thumbnail, duration, end dates (0009)
--
-- Brand form additions: an optional Google Drive brief link, an
-- optional thumbnail image link, and a campaign duration (7 / 14 /
-- 30 days, or null = runs until the budget ends). started_at /
-- ends_at are set by the admin-approval route when a campaign goes
-- live; a campaign auto-ends when its duration finishes OR its
-- budget hits 0, whichever comes first. The app reads all five
-- columns as optional and falls back gracefully, so this migration
-- is safe to run after the code deploy.

alter table public.campaigns
  add column if not exists brief_url text,
  add column if not exists thumbnail_url text,
  add column if not exists duration_days int,
  add column if not exists started_at timestamptz,
  add column if not exists ends_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_duration_check'
  ) then
    alter table public.campaigns
      add constraint campaigns_duration_check
      check (duration_days is null or duration_days in (7, 14, 30)) not valid;
  end if;
end $$;
