-- GET PAID TO POST — refund requests for rejected campaigns (0041)
--
-- ROUND 4 AUDIT P1-A2 / P2-B5: a brand that paid and then got its
-- campaign rejected had NO refund state anywhere — the reject
-- branch only flipped the status and wrote a chat message, so
-- there was no amount, no TxID, and no request tracking, and the
-- rejected campaign vanished from /admin entirely. This table is
-- the refund queue: a brand requests its paid budget back (the
-- refund-request API route, another workstream, writes the row),
-- and the owner sees open requests on /admin next to the rejected
-- campaign and marks a request 'sent' once the USDT refund has
-- actually been sent by hand. Refunds stay manual — nothing here
-- moves money on its own.
--
-- One open request per campaign (partial unique index on
-- campaign_id where status = 'requested'): a rejected campaign
-- owes at most one outstanding refund at a time.
--
-- RLS: a brand (authenticated) can select/insert only its own
-- rows (user_id = auth.uid()); the owner has full access via the
-- same is_admin() pattern as campaign_budget_history (migration
-- 0033). Creators and other brands cannot read or write rows.
--
-- Run once in the Supabase SQL Editor. Idempotent / safe to
-- re-run: create table if not exists + drop policy if exists.

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null,
  amount numeric(12, 2) not null,
  payment_tx_id text,
  status text not null default 'requested'
    check (status in ('requested', 'sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_refund_requests_campaign
  on public.refund_requests (campaign_id, created_at desc);

-- One open refund request per campaign.
create unique index if not exists idx_refund_requests_one_open_per_campaign
  on public.refund_requests (campaign_id)
  where status = 'requested';

alter table public.refund_requests enable row level security;

-- A brand reads only its own refund requests.
drop policy if exists "refund_requests brand select own"
  on public.refund_requests;
create policy "refund_requests brand select own"
  on public.refund_requests
  for select using (user_id = auth.uid());

-- A brand files a refund request only for itself.
drop policy if exists "refund_requests brand insert own"
  on public.refund_requests;
create policy "refund_requests brand insert own"
  on public.refund_requests
  for insert with check (user_id = auth.uid());

-- Owner-only read: the refund queue lives on /admin, which is
-- owner-only. Same pattern as campaign_budget_history
-- (migration 0033).
drop policy if exists "admins read refund_requests"
  on public.refund_requests;
create policy "admins read refund_requests"
  on public.refund_requests
  for select using (public.is_admin());

-- Owner-only write (marking a request 'sent'): the USING clause
-- also serves as the WITH CHECK for updates, so the owner-only
-- API route can write rows. Same pattern as
-- campaign_budget_history (migration 0033).
drop policy if exists "admins write refund_requests"
  on public.refund_requests;
create policy "admins write refund_requests"
  on public.refund_requests
  for all using (public.is_admin());
