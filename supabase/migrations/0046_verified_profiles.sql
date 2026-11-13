-- GET PAID TO POST — Bio-code profile verification (0046)
--
-- Replaces OAuth-connect as the ownership proof (Turn, 2026-11-13,
-- final decision): a creator pastes a TikTok / Instagram / YouTube
-- profile link, the site gives a unique code (GPTP-XXXXXX), the
-- creator writes the code in their profile bio, waits 2 minutes,
-- clicks Verify, and the server fetches the PUBLIC profile bio and
-- checks the code is there. No API approval, no login, no business
-- registration needed for this — the bio is public.
--
-- One row per user per platform. verified_at null = not verified
-- yet (a code is pending, or a screenshot is waiting for the
-- admin's manual check). verified_at set = the profile is LOCKED
-- to this user: submissions for that platform must come from this
-- handle/channel, and the profile link cannot be changed without
-- the admin unlocking it (delete the row).
--
-- UNIQUE(platform, handle) stops two users claiming the same
-- profile. UNIQUE(user_id, platform) stops one user locking two
-- profiles on one platform. For YouTube the handle is the @handle
-- (lowercase, no @) or "uc:<CHANNEL_ID>" for /channel/ links; the
-- channel_id column is filled at verify time from channels.list,
-- and the verify route also refuses when another user already
-- verified the same channel_id.
--
-- RLS: a user reads/inserts/updates ONLY their own rows; the admin
-- (public.is_admin(), migration 0002) reads and updates every row
-- so /admin can approve manual-review screenshots.
--
-- Run once in the Supabase SQL Editor.

create table if not exists public.verified_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'instagram', 'youtube')),
  profile_url text not null,
  handle text not null,
  channel_id text,
  bio_code text,
  code_expires_at timestamptz,
  verified_at timestamptz,
  verified_by text check (verified_by in ('auto', 'manual')),
  proof_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, handle),
  unique (user_id, platform)
);

alter table public.verified_profiles enable row level security;

create policy "verified_profiles select own" on public.verified_profiles
  for select using (user_id = auth.uid());

create policy "verified_profiles select admin" on public.verified_profiles
  for select using (public.is_admin());

create policy "verified_profiles insert own" on public.verified_profiles
  for insert with check (user_id = auth.uid());

create policy "verified_profiles update own" on public.verified_profiles
  for update using (user_id = auth.uid());

create policy "verified_profiles update admin" on public.verified_profiles
  for update using (public.is_admin());

create policy "verified_profiles delete admin" on public.verified_profiles
  for delete using (public.is_admin());
