-- GET PAID TO POST — YouTube connections (0019)
--
-- Stores one row per creator per YouTube channel connected through
-- Google OAuth 2.0 (scope youtube.readonly). The callback at
-- /api/auth/youtube/callback exchanges the one-time code for an
-- access token + refresh token and saves the channel id + title
-- here, so the site can prove a submitted YouTube video belongs to
-- the creator who submitted it.
--
-- Why this exists (2026-11-09, Turn's call): YouTube view counts
-- are public data, so a pasted link alone let ANYONE submit ANY
-- viral video and claim its views. TikTok does not have this hole —
-- Login Kit only ever returns the connected creator's own videos.
-- From this migration on, a YouTube submission is only accepted
-- when the video's channelId matches the creator's CONNECTED
-- channel (checked at submit time in /api/submissions and again on
-- every 3-hour refresh). A link to someone else's video is
-- rejected, never counted, and never paid.
--
-- Tokens are stored ENCRYPTED (AES-256-GCM, ENCRYPTION_KEY — see
-- src/lib/views/crypto.ts), same as TikTok. The refresh job only
-- needs the channel id (the view count comes from the public API
-- key), so no token leaves the database for refresh; the profile
-- route re-reads the channel title with the saved token when the
-- callback did not store one.
--
-- RLS: a signed-in user reads, inserts, updates and deletes ONLY
-- their own rows (DELETE policy included from the start — the
-- TikTok table needed a second migration for it, 0017).
--
-- Run once in the Supabase SQL Editor. The OAuth client itself
-- (Google Cloud Console) and the Vercel env vars GOOGLE_CLIENT_ID /
-- GOOGLE_CLIENT_SECRET come after this; until they exist the
-- connect route redirects to /connect?youtube=not_configured.

create table if not exists public.youtube_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel_id text not null,
  channel_title text,
  channel_handle text,
  access_token text not null default '',
  refresh_token text not null default '',
  scope text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel_id)
);

alter table public.youtube_connections enable row level security;

create policy "youtube_connections select own" on public.youtube_connections
  for select using (user_id = auth.uid());

create policy "youtube_connections insert own" on public.youtube_connections
  for insert with check (user_id = auth.uid());

create policy "youtube_connections update own" on public.youtube_connections
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "youtube_connections delete own" on public.youtube_connections
  for delete using (user_id = auth.uid());

-- Connected YouTube channels for the 3-hour view refresh: the job
-- compares each pending YouTube video's channelId against the
-- creator's connected channel and only counts matching videos.
create or replace function public.list_youtube_channels_for_refresh()
returns table (
  user_id uuid,
  channel_id text
)
language sql security definer
set search_path = public as $$
  select c.user_id, c.channel_id
  from public.youtube_connections c;
$$;

grant execute on function public.list_youtube_channels_for_refresh()
  to anon, authenticated;
