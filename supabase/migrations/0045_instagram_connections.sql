-- GET PAID TO POST — Instagram connections (0045)
--
-- Stores one row per creator per Instagram account connected
-- through Meta's Instagram Login (Unified login / Instagram API
-- with Instagram Login, OAuth 2.0). The callback at
-- /api/auth/instagram/callback exchanges the one-time code for a
-- short-lived token, then a 60-day long-lived token, and upserts
-- here, so later code can call the Graph API (/me/media +
-- /{media-id}/insights) and read view counts for that creator's
-- own Reels.
--
-- Why this exists (2026-11-13, Meta app "Get Paid To Post" live,
-- App ID 1433209415104875): until now Instagram rows were skipped
-- by the 3-hour view refresh and Instagram submits were checked
-- only against the handle in the Reel URL. From this migration on,
-- an Instagram submission is only accepted when the Reel is in
-- the creator's CONNECTED Instagram account (checked at submit
-- time in /api/submissions and again on every 3-hour refresh) —
-- the same ownership gate YouTube and TikTok already have. A link
-- to someone else's Reel is rejected, never counted, and never
-- paid. The handle check against the onboarding profile link
-- stays as the first check.
--
-- Tokens are stored ENCRYPTED (AES-256-GCM, ENCRYPTION_KEY — see
-- src/lib/views/crypto.ts), same as TikTok. Long-lived tokens live
-- 60 days; the refresh job refreshes them inside their last 7
-- days and saves the new ones back encrypted (save_instagram_
-- tokens below).
--
-- RLS: a signed-in user reads, inserts, updates and deletes ONLY
-- their own rows (DELETE policy included from the start).
--
-- Run once in the Supabase SQL Editor. The Vercel env vars
-- INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET come after this; until
-- they exist the connect route redirects to
-- /connect?instagram=not_configured.
--
-- NOTE: while the Meta app is in Development mode, only Instagram
-- Testers (Roles → Instagram Testers in the app dashboard) can
-- connect. App Review + business verification come later.

create table if not exists public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ig_user_id text not null,
  username text,
  account_type text,
  access_token text not null default '',
  scope text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ig_user_id)
);

alter table public.instagram_connections enable row level security;

create policy "instagram_connections select own" on public.instagram_connections
  for select using (user_id = auth.uid());

create policy "instagram_connections insert own" on public.instagram_connections
  for insert with check (user_id = auth.uid());

create policy "instagram_connections update own" on public.instagram_connections
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "instagram_connections delete own" on public.instagram_connections
  for delete using (user_id = auth.uid());

-- Instagram connections for the refresh job. Tokens are encrypted
-- at rest (AES-256-GCM, ENCRYPTION_KEY); this only returns
-- ciphertext (legacy plaintext rows are re-encrypted on first
-- refresh, same as TikTok).
create or replace function public.list_instagram_tokens_for_refresh()
returns table (
  user_id uuid,
  ig_user_id text,
  access_token text,
  token_expires_at timestamptz
)
language sql security definer
set search_path = public as $$
  select c.user_id, c.ig_user_id, c.access_token, c.token_expires_at
  from public.instagram_connections c;
$$;

grant execute on function public.list_instagram_tokens_for_refresh()
  to anon, authenticated;

-- Save a refreshed Instagram token (already encrypted by the
-- caller). Long-lived tokens have no refresh token — only the
-- access token and its new expiry are saved.
create or replace function public.save_instagram_tokens(
  p_user_id uuid,
  p_ig_user_id text,
  p_access_token text,
  p_token_expires_at timestamptz
)
returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  update public.instagram_connections
    set access_token = p_access_token,
        token_expires_at = p_token_expires_at,
        updated_at = now()
    where user_id = p_user_id
      and ig_user_id = p_ig_user_id;
  return found;
end; $$;

grant execute on function public.save_instagram_tokens(uuid, text, text, timestamptz)
  to anon, authenticated;
