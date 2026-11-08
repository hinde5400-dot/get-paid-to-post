-- GET PAID TO POST — TikTok connections (0016)
--
-- Stores one row per creator per TikTok account connected through
-- Login Kit (OAuth 2.0). The callback at /api/auth/tiktok/callback
-- exchanges the one-time code for an access token (24h) + refresh
-- token (365d) and upserts here, so later code can call the Display
-- API (video/list, video/query) and read view counts for that
-- creator's own videos.
--
-- NOT RUN YET — apply in the Supabase SQL Editor before the connect
-- flow can save anything. Until then the callback redirects to
-- /connect?tiktok=save_failed instead of pretending it worked.
-- The app reads the table as optional, so this migration is safe to
-- run after the code deploy.
--
-- Tokens are the creator's own: RLS lets a signed-in user read,
-- insert and update ONLY their own rows. No DELETE policy — a
-- disconnect is an update (or a future revoke call), not a delete.

create table if not exists public.tiktok_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  open_id text not null,
  username text,
  display_name text,
  avatar_url text,
  access_token text not null,
  refresh_token text not null,
  scope text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, open_id)
);

alter table public.tiktok_connections enable row level security;

create policy "tiktok_connections select own" on public.tiktok_connections
  for select using (user_id = auth.uid());

create policy "tiktok_connections insert own" on public.tiktok_connections
  for insert with check (user_id = auth.uid());

create policy "tiktok_connections update own" on public.tiktok_connections
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
