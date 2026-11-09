-- GET PAID TO POST — creator bot-rejection flags (0026)
--
-- P1-c (2026-11-09, Content Rewards model: Bot Score flags a
-- submission for human review, botting = permanent ban with one
-- appeal): per-creator bot-view rejection tracking.
--
-- Turn's ladder, cumulative per creator across ALL campaigns
-- (rejection_reason = 'bot views', the fixed value from P0 batch 3):
--   6 bot rejections  -> CONCERN (owner alerted, watch the creator)
--   10 bot rejections -> FLAG (owner alerted; one more = auto-ban)
--   11 bot rejections -> AUTO-BAN (users.is_blocked = true, same
--     mechanism as POST /api/admin/block — blocked accounts cannot
--     log in, submit, or withdraw). A flagged creator is NOT banned
--     at 10, only at the next bot rejection.
--
-- `creator_flags` is the flag STATE (when flagged / when banned).
-- The bot-rejection COUNT itself is always computed live from the
-- submissions table (see getCreatorBotRejections in src/lib/data.ts)
-- so the admin view can never drift; bot_rejections here is the
-- count as of the last bot rejection the review route processed.
-- The review route (POST /api/admin/review) keeps this table
-- updated after every 'bot views' rejection.
--
-- Run once in the Supabase SQL Editor.

create table if not exists public.creator_flags (
  user_id uuid primary key references public.users (id) on delete cascade,
  bot_rejections integer not null default 0,
  flagged_at timestamptz,
  banned_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.creator_flags enable row level security;

-- Owner-only: the fraud view lives on /admin, which is owner-only.
-- Creators never see bot counts or flags (no select policy for them).
create policy "admins read creator_flags" on public.creator_flags
  for select using (public.is_admin());
create policy "admins write creator_flags" on public.creator_flags
  for all using (public.is_admin());
