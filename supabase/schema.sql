-- GET PAID TO POST — consolidated schema (0001 + 0002 combined)
-- Paste this whole file into the Supabase SQL Editor on a fresh project.
-- Prefer the numbered files in migrations/ if you use the Supabase CLI.

-- GET PAID TO POST — Supabase schema, part 1 of 2
-- Run in the Supabase SQL Editor (see README). Safe to run once on a fresh project.
-- Free tiers only: Supabase Free + Vercel Hobby, domain get-paid-to-post.vercel.app

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  tiktok_url text,
  instagram_url text,
  youtube_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  title text not null,
  rate_per_1m numeric(10,2) not null check (rate_per_1m > 0),
  budget_total numeric(12,2) not null check (budget_total >= 500),
  budget_left numeric(12,2) not null,
  spots_left int not null default 0,
  spots_total int not null default 0,
  category text not null,
  platform text not null,
  description text,
  rules text,
  min_payout numeric(10,2) default 1,
  max_per_video numeric(10,2),
  paid_out numeric(12,2) not null default 0,
  is_funded boolean not null default false,
  status text not null default 'draft',
  base_pay numeric(10,2) not null default 10,
  view_bonus_per_1k numeric(10,2) not null default 0.75,
  views_tracked_days int not null default 14,
  max_posts int not null default 7,
  earn_up_to numeric(10,2) not null default 300,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  post_url text not null,
  platform text not null,
  views bigint not null default 0,
  status text not null default 'pending',
  earnings numeric(12,2) not null default 0,
  hold_until timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, post_url)
);

create table if not exists public.wallets (
  user_id uuid primary key references public.users(id) on delete cascade,
  available_balance numeric(12,2) not null default 0,
  pending_balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaigns_live
  on public.campaigns (is_funded, status);
create index if not exists idx_submissions_user
  on public.submissions (user_id, created_at desc);
create index if not exists idx_submissions_platform
  on public.submissions (user_id, platform, created_at desc);
create index if not exists idx_submissions_url
  on public.submissions (post_url);

-- Create profile + wallet automatically on signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  insert into public.wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: ON for every table.
alter table public.users enable row level security;
alter table public.campaigns enable row level security;
alter table public.submissions enable row level security;
alter table public.wallets enable row level security;

create policy "users read own" on public.users
  for select using (auth.uid() = id);
create policy "users update own" on public.users
  for update using (auth.uid() = id);
create policy "campaigns public read" on public.campaigns
  for select using (true);
create policy "campaigns insert authenticated" on public.campaigns
  for insert with check (auth.uid() is not null);
create policy "submissions own read" on public.submissions
  for select using (auth.uid() = user_id);
create policy "submissions own insert" on public.submissions
  for insert with check (auth.uid() = user_id);
create policy "wallets own read" on public.wallets
  for select using (auth.uid() = user_id);
create policy "wallets own update" on public.wallets
  for update using (auth.uid() = user_id);

-- NOTE: Brand campaign inserts and wallet balance updates go through the
-- API routes / Admin Review in this repo, not direct public inserts.
-- Review every policy in Supabase > Authentication > Policies before
-- taking real money. Never put the service_role key in the website code.

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
-- NOTE: method was ('usdt', 'pakistani_bank', 'wise') in 0002; the
-- live check is USDT-only since 0006 (usdt_trc20 / usdt_bep20).
-- Migrations 0005–0011 supersede parts of this consolidated file.
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 10),
  fee numeric(12,2) not null default 0,
  final_amount numeric(12,2) not null,
  method text not null check (method in ('usdt_trc20', 'usdt_bep20')),
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
