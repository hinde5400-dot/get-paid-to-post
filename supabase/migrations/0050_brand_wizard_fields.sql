-- GET PAID TO POST — Brand campaign creation wizard (0050)
--
-- Multi-step wizard on /brands (Content-Rewards-style flow, our
-- payment model): Organization / Goal / Features / Details /
-- Requirements / Configuration / Summary / Fund. New storage:
--
-- campaigns.goal — step 2, exactly one of: 'Brand awareness',
--   'Drive sales', 'UGC library', 'Grow a community'.
-- campaigns.features — step 3, multi-select from: Campaigns,
--   Creators, Payouts, Analytics, Submissions, Discover,
--   Retainers, Drafts. Informational only — no feature is built
--   behind a selection; the list is stored for later.
-- campaigns.types — step 4, multi-select: 'Clipping',
--   'UGC (With Face)'.
-- campaigns.brief_lines — step 5, one rule per line (the textarea
--   lines, non-empty only). The legacy `rules` text column keeps
--   the same lines joined with newlines so existing readers
--   (admin review, campaign detail) keep working.
-- campaigns.require_link_in_bio — step 5 toggle.
-- campaigns.required_sound_tiktok / required_sound_instagram —
--   step 5, optional sound URLs.
-- campaigns.reference_links — step 4, reference-material links
--   (Google Docs / Drive / Notion). At least one reference link
--   OR a Drive folder link (brief_url) is required by the API.
-- campaigns.visibility — step 6: 'public' | 'private'.
-- campaigns.show_on_discover — step 6 toggle, default on.
-- campaigns.access_type — step 6: 'open' | 'application'.
-- users.website / users.brand_description — step 1, saved to the
--   brand's own profile row via PATCH /api/profile.
--
-- All guards are `if not exists`, so the file is safe to re-run.
-- Apply BEFORE deploying the wizard code: POST /api/campaigns
-- inserts the new campaign columns, and the insert fails while
-- they are missing. Run once in the Supabase SQL Editor.
-- No RLS changes: campaigns/users policies are unchanged, and the
-- new columns ride on the existing rows/policies.

alter table public.campaigns
  add column if not exists goal text,
  add column if not exists features text[] not null default '{}',
  add column if not exists types text[] not null default '{}',
  add column if not exists brief_lines text[] not null default '{}',
  add column if not exists require_link_in_bio boolean not null default false,
  add column if not exists required_sound_tiktok text,
  add column if not exists required_sound_instagram text,
  add column if not exists reference_links text[] not null default '{}',
  add column if not exists visibility text not null default 'public',
  add column if not exists show_on_discover boolean not null default true,
  add column if not exists access_type text not null default 'open';

alter table public.users
  add column if not exists website text,
  add column if not exists brand_description text;
