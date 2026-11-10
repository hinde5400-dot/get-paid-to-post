-- GET PAID TO POST — campaign budget edit history (0033)
--
-- ADMIN CAMPAIGN CARDS + BUDGET EDIT (2026-11-10, Turn's
-- decisions): the owner can edit a live or pending campaign's
-- budget from /admin (increase or decrease). Every edit is
-- recorded here — reason + old/new totals + who/when — so a
-- top-up from the brand ("Brand sent $100 top-up") or a
-- reduction ("Reduced — refunding remainder to brand") is
-- always traceable. The site never charges or refunds on its
-- own: the owner verifies the brand's payment himself, and any
-- refund is sent manually by email + USDT.
--
-- The edit itself is a plain UPDATE of campaigns.budget_total /
-- budget_left in POST /api/admin/campaign-budget (spent =
-- budget_total - budget_left; new total must be > 0 and >=
-- spent; new left = new total - spent). This table is the audit
-- trail for that update.
--
-- Run once in the Supabase SQL Editor. Idempotent / safe to
-- re-run: create table if not exists + drop policy if exists.

create table if not exists public.campaign_budget_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  changed_by uuid references public.users (id) on delete set null,
  old_budget_total numeric(12, 2) not null,
  new_budget_total numeric(12, 2) not null,
  old_budget_left numeric(12, 2) not null,
  new_budget_left numeric(12, 2) not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_budget_history_campaign
  on public.campaign_budget_history (campaign_id, created_at desc);

alter table public.campaign_budget_history enable row level security;

-- Owner-only: budget edits live on /admin, which is owner-only.
-- Creators and brands never see the history (no select policy
-- for them). Same pattern as submission_flags (migration 0031):
-- for ALL, the USING clause also serves as the WITH CHECK for
-- inserts, so the owner-only API route can write rows.
drop policy if exists "admins read campaign_budget_history"
  on public.campaign_budget_history;
create policy "admins read campaign_budget_history"
  on public.campaign_budget_history
  for select using (public.is_admin());

drop policy if exists "admins write campaign_budget_history"
  on public.campaign_budget_history;
create policy "admins write campaign_budget_history"
  on public.campaign_budget_history
  for all using (public.is_admin());
