-- GET PAID TO POST — view refresh (0018)
--
-- Auto view-count refresh, every 3 hours, for pending submissions:
-- YouTube (API key, public videos) and TikTok (creator's own videos
-- via Login Kit). Instagram is NOT wired yet — no Instagram app or
-- API access exists (setup paused at Meta mobile verification), so
-- Instagram rows are skipped by the refresh code until it does.
--
-- How it runs (no service_role key anywhere, no Vercel cron — the
-- free Hobby plan only allows daily crons): a GitHub Actions
-- workflow (.github/workflows/refresh-views.yml) calls
-- /api/cron/refresh-views every 3 hours with CRON_SECRET. The route
-- has no user session, so all database access goes through the
-- SECURITY DEFINER functions below — the same pattern as
-- release_matured_holds (0011).
--
-- Honest note on apply_view_refresh: it is callable with the public
-- anon key, like release_matured_holds. It can only set the `views`
-- number (and refresh timestamp) on a still-pending submission — it
-- cannot approve anything, credit earnings, or touch money. The
-- owner still confirms the views on /admin before approving, and
-- the admin list shows when each number was last auto-checked.
-- TikTok tokens are stored ENCRYPTED (see src/lib/views/crypto.ts),
-- so list_tiktok_tokens_for_refresh only ever returns ciphertext
-- (legacy plaintext rows are re-encrypted on first refresh).
--
-- Run once in the Supabase SQL Editor.

alter table public.submissions
  add column if not exists views_refreshed_at timestamptz;

-- Pending submissions inside the 14-day view-tracking window,
-- stalest first. The route skips rows refreshed < 3h ago.
create or replace function public.list_pending_submissions_for_refresh()
returns table (
  id uuid,
  user_id uuid,
  platform text,
  post_url text,
  views bigint,
  views_refreshed_at timestamptz
)
language sql security definer
set search_path = public as $$
  select s.id, s.user_id, s.platform, s.post_url, s.views,
         s.views_refreshed_at
  from public.submissions s
  where s.status = 'pending'
    and s.created_at > now() - interval '14 days'
  order by s.views_refreshed_at asc nulls first, s.created_at asc
  limit 200;
$$;

grant execute on function public.list_pending_submissions_for_refresh()
  to anon, authenticated;

-- Store a freshly fetched view count on a still-pending submission.
create or replace function public.apply_view_refresh(
  p_submission_id uuid,
  p_views bigint
)
returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  update public.submissions
    set views = greatest(0, p_views),
        views_refreshed_at = now()
    where id = p_submission_id
      and status = 'pending';
  return found;
end; $$;

grant execute on function public.apply_view_refresh(uuid, bigint)
  to anon, authenticated;

-- TikTok connections for the refresh job. Tokens are encrypted at
-- rest (AES-256-GCM, ENCRYPTION_KEY); this only returns ciphertext.
create or replace function public.list_tiktok_tokens_for_refresh()
returns table (
  user_id uuid,
  open_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz
)
language sql security definer
set search_path = public as $$
  select c.user_id, c.open_id, c.access_token, c.refresh_token,
         c.token_expires_at, c.refresh_expires_at
  from public.tiktok_connections c;
$$;

grant execute on function public.list_tiktok_tokens_for_refresh()
  to anon, authenticated;

-- Save refreshed TikTok tokens (already encrypted by the caller).
create or replace function public.save_tiktok_tokens(
  p_user_id uuid,
  p_open_id text,
  p_access_token text,
  p_refresh_token text,
  p_token_expires_at timestamptz,
  p_refresh_expires_at timestamptz
)
returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  update public.tiktok_connections
    set access_token = p_access_token,
        refresh_token = p_refresh_token,
        token_expires_at = p_token_expires_at,
        refresh_expires_at = p_refresh_expires_at,
        updated_at = now()
    where user_id = p_user_id
      and open_id = p_open_id;
  return found;
end; $$;

grant execute on function public.save_tiktok_tokens(uuid, text, text, text, timestamptz, timestamptz)
  to anon, authenticated;
