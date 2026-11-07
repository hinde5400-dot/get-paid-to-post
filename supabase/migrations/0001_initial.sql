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
