-- GET PAID TO POST — payout Transaction ID on withdrawals (0040)
--
-- ROUND 4 AUDIT P1-A3: marking a withdrawal "paid" kept no record
-- of WHICH on-chain transfer paid it — the owner sends USDT from
-- his own wallet app, clicks Mark paid, and the system kept no
-- payout TxID. A creator disputing a payout ("I never received
-- it") could not be answered from the site; the only proof was
-- the owner's wallet app history. The admin withdrawals route now
-- accepts an optional payout_tx_id on the "paid" action (same
-- 64-hex validation as brand TxIDs, isValidTronTxId) and the
-- withdrawal list + Payouts list show it with a Tronscan link.
--
-- The column is nullable: rows marked paid before this migration
-- have no TxID and never will — the UI says "not recorded" for
-- them instead of inventing one. The CHECK mirrors the brand
-- TxID rule (exactly 64 hexadecimal characters, or null).
--
-- Run once in the Supabase SQL Editor. Idempotent / safe to
-- re-run: add column if not exists + guarded constraint.

alter table public.withdrawals
  add column if not exists payout_tx_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'withdrawals_payout_tx_id_check'
  ) then
    alter table public.withdrawals
      add constraint withdrawals_payout_tx_id_check
      check (
        payout_tx_id is null
        or payout_tx_id ~ '^[0-9a-fA-F]{64}$'
      );
  end if;
end $$;
