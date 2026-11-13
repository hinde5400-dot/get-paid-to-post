-- GET PAID TO POST — Admin tabs rebuild (0049)
--
-- Turn's final admin spec (2026-11-13): one /admin page with tabs
-- (Review | Campaigns | Fraud | Brand Messages | Withdrawals |
-- Creators | Recheck). Three things need new storage:
--
-- 1. campaigns.is_paused — the Pause / Start button on each
--    campaign card. A paused campaign is NOT live: it hides from
--    Discover, its detail page 404s, and new submissions are
--    rejected until the admin starts it again. Pending campaigns
--    are unaffected (they are not live anyway). Default false.
--
-- 2. notifications — the admin marking a withdrawal Paid must
--    notify the creator, and a creator Warning must notify the
--    creator too. Minimal: one row per event, shown in the
--    creator's dashboard. No push, no email — the dashboard list
--    is the notification surface.
--
-- 3. creator_warnings — the Warning button per creator in the
--    Creators tab. A warning is a record (who, why, when) plus a
--    notification to the creator. It is NOT a ban — bans still go
--    through the existing fraud ladder / block flow.
--
-- RLS: a user reads/updates ONLY their own notifications (mark
-- read) and their own warnings; the admin (public.is_admin(),
-- migration 0002) reads/inserts everything. API routes insert
-- as the admin's session, so the insert policy is is_admin().
--
-- Run once in the Supabase SQL Editor.

alter table public.campaigns
  add column if not exists is_paused boolean not null default false;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications select own" on public.notifications
  for select using (user_id = auth.uid());

create policy "notifications select admin" on public.notifications
  for select using (public.is_admin());

create policy "notifications insert admin" on public.notifications
  for insert with check (public.is_admin());

create policy "notifications update own" on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.creator_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  reason text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists creator_warnings_user_created_idx
  on public.creator_warnings (user_id, created_at desc);

alter table public.creator_warnings enable row level security;

create policy "creator_warnings select own" on public.creator_warnings
  for select using (user_id = auth.uid());

create policy "creator_warnings select admin" on public.creator_warnings
  for select using (public.is_admin());

create policy "creator_warnings insert admin" on public.creator_warnings
  for insert with check (public.is_admin());
