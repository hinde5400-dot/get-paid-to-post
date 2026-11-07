-- GET PAID TO POST — Supabase schema, part 2 of 2
-- Owner-only Admin Review, blocking, bundle submissions, withdrawals.
-- Run after 0001_initial.sql.

-- Extra profile columns: owner flag + block flag.
alter table public.users
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_blocked boolean not null default false;

-- Bundle submissions: TikTok + Instagram together, YouTube optional.
alter table public.submissions
  add column if not exists likes bigint not null default 0,
  add column if not exists bundle_id uuid,
  add column if not exists submission_code text,
  add column if not exists how_made text not null default '',
  add column if not exists proof_screenshots text[] not null default '{}',
  add column if not exists is_duplicate boolean not null default false;

create index if not exists idx_submissions_bundle
  on public.submissions (bundle_id);

-- Wallet: track total withdrawn.
alter table public.wallets
  add column if not exists withdrawn_total numeric(12,2) not null default 0;

-- Withdrawal requests.
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 10),
  fee numeric(12,2) not null default 0,
  final_amount numeric(12,2) not null,
  method text not null check (method in ('usdt', 'pakistani_bank', 'wise')),
  details text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists idx_withdrawals_user
  on public.withdrawals (user_id, created_at desc);

alter table public.withdrawals enable row level security;
create policy "withdrawals own read" on public.withdrawals
  for select using (auth.uid() = user_id);
create policy "withdrawals own insert" on public.withdrawals
  for insert with check (auth.uid() = user_id);

-- First account created becomes the owner.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  admin_exists boolean;
begin
  select exists (select 1 from public.users where is_admin = true)
    into admin_exists;
  insert into public.users (id, email, is_admin)
    values (new.id, new.email, not admin_exists)
    on conflict (id) do nothing;
  insert into public.wallets (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end; $$;

-- Helper: is the signed-in user the owner?
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.users where id = auth.uid() and is_admin = true
  );
$$;

-- Owner can read and update everything needed for Admin Review.
create policy "admins read all users" on public.users
  for select using (public.is_admin());
create policy "admins update users" on public.users
  for update using (public.is_admin());
create policy "admins read all submissions" on public.submissions
  for select using (public.is_admin());
create policy "admins update submissions" on public.submissions
  for update using (public.is_admin());
create policy "admins update campaigns" on public.campaigns
  for update using (public.is_admin());
create policy "admins read all wallets" on public.wallets
  for select using (public.is_admin());
create policy "admins update wallets" on public.wallets
  for update using (public.is_admin());
create policy "admins read all withdrawals" on public.withdrawals
  for select using (public.is_admin());
