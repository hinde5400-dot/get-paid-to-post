-- GET PAID TO POST — Admin-only notes, flags & reminders (0051)
--
-- Turn's order (2026-11-14): /admin gets personal things only
-- the owner sees — internal notes per campaign / brand / creator,
-- private flags, and his own reminders. NOTHING here is shown to
-- brands or creators anywhere: no other page reads these tables,
-- and RLS allows only the admin (public.is_admin(), migration
-- 0002) to read or write them.
--
-- Run once in the Supabase SQL Editor, BEFORE deploying the code
-- that reads these tables (the admin page loads them; a missing
-- table reads as "not set up yet", never a broken page).
--
-- 1. admin_notes — one row per note. target_type is
--    'campaign' | 'brand' | 'creator'; target_id is the campaign
--    id or the user id. flag is optional: 'watch' | 'trusted' |
--    'risky' | 'vip' (or null = no flag).
-- 2. admin_reminders — Turn's own to-dos: title, optional body,
--    optional due date, done flag.

create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('campaign', 'brand', 'creator')),
  target_id text not null,
  note text not null,
  flag text check (flag is null or flag in ('watch', 'trusted', 'risky', 'vip')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists admin_notes_target_idx
  on public.admin_notes (target_type, target_id, created_at desc);

alter table public.admin_notes enable row level security;

create policy "admin_notes admin only" on public.admin_notes
  for all using (public.is_admin());

create table if not exists public.admin_reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  due_date date,
  done boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists admin_reminders_done_created_idx
  on public.admin_reminders (done, created_at desc);

alter table public.admin_reminders enable row level security;

create policy "admin_reminders admin only" on public.admin_reminders
  for all using (public.is_admin());
