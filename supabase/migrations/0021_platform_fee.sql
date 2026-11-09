-- GET PAID TO POST — 15% flat platform fee + drop base pay (0021)
--
-- P0 batch 2 (2026-11-09, Turn's decisions):
-- (a) Platform fee is 15% FLAT, charged ON TOP of the brand's
--     budget — first campaign = repeat campaign, no inversion.
--     The brand SENDS budget_total + 15% (totalToSend); the campaign
--     runs on the full budget_total (budget_left = budget_total)
--     and platform_fee is the 15% slice kept separately.
--     The insert in src/app/api/campaigns/route.ts computes both.
-- (b) Base pay is views-only: there is no $10 base pay per approved
--     post anywhere any more. The base_pay column (migration 0001,
--     not null default 10) is dropped — nothing reads it for money
--     (review credits views only via payoutForViews) and every UI
--     reference to it is removed in the same batch. The insert no
--     longer writes base_pay, so this migration is safe to run
--     before or after the code deploy; the live database has ZERO
--     campaigns.
-- Run once in the Supabase SQL Editor.

-- (a) Platform fee slice of the budget.
alter table public.campaigns
  add column if not exists platform_fee numeric(10,2) not null default 0;

-- (b) No base pay any more.
alter table public.campaigns
  drop column if exists base_pay;
