-- GET PAID TO POST — multi-platform campaigns (0012)
--
-- Brands can now pick any combination of TikTok / Instagram /
-- YouTube for one campaign (1, 2 or all 3). The new campaigns.platforms
-- text[] column holds the chosen platforms. The old campaigns.platform
-- column is kept for backward compatibility and keeps holding the
-- convention: 'all' when all three platforms are chosen, otherwise
-- the first chosen platform. Rows written before this migration are
-- backfilled from platform ('all' -> all three, otherwise the single
-- platform). The app reads platforms as optional and falls back to
-- platform, so this migration is safe to run after the code deploy.

alter table public.campaigns
  add column if not exists platforms text[] not null default '{}';

update public.campaigns
set platforms = case
  when platform = 'all' then array['tiktok', 'instagram', 'youtube']
  when platform in ('tiktok', 'instagram', 'youtube') then array[platform]
  else array['tiktok']
end
where platforms = '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_platforms_check'
  ) then
    alter table public.campaigns
      add constraint campaigns_platforms_check
      check (
        cardinality(platforms) between 1 and 3
        and platforms <@ array['tiktok', 'instagram', 'youtube']
      ) not valid;
  end if;
end $$;
