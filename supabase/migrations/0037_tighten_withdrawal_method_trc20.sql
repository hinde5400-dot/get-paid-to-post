-- GET PAID TO POST — tighten withdrawal method to TRC20 only (0037)
--
-- Turn decided 2026-11-11 00:53 PKT: USDT TRC20 ONLY — BEP20 removed
-- everywhere. The app code already rejects anything but usdt_trc20
-- (withdrawals route + WithdrawModal, batch 0ff9acf), and no
-- withdrawals exist yet, so this is defense-in-depth only: tighten
-- the DB CHECK constraint from migration 0006 so a BEP20 row can
-- never be created even outside the app. Constraint name is
-- withdrawals_method_usdt_only (created in 0006). Kept NOT VALID
-- like the original — zero rows exist, nothing to validate.
--
-- Run once in the Supabase SQL Editor. Do NOT edit old migrations.

alter table public.withdrawals
  drop constraint if exists withdrawals_method_usdt_only;

alter table public.withdrawals
  add constraint withdrawals_method_usdt_only
  check (method in ('usdt_trc20')) not valid;
