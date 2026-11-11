-- GET PAID TO POST — Round 5 audit fixes (0043)
--
-- Four small schema additions, all backward-compatible (defaults
-- everywhere, no renames, no drops of live data). Code that uses
-- these columns must read them as optional with fallbacks until
-- this migration is applied live — the app must not crash on the
-- old shape.
--
-- 1) P1 (creator scope): My Posts falsely claimed "Capped by the
--    campaign's remaining budget" on ordinary approved clips. The
--    old code inferred budget-capping from post-approval view
--    growth; earnings are locked at approval-time views, so the
--    inference was wrong. The review route now stores the FACT at
--    approve time instead: submissions.budget_capped (was the
--    approval actually truncated by the remaining budget?) and
--    submissions.approval_views (the view count earnings were
--    locked on). My Posts renders from these columns only.
-- 2) P2 (brand/admin scopes): the "New reply from admin" badge
--    could clear before the brand ever read the reply, because the
--    admin's mark-read and the brand's mark-read shared the single
--    is_read column. brand_messages gains brand_read (the brand's
--    own read state); the brand badge counts admin-sent rows where
--    brand_read = false, and the brand's mark-read sets brand_read
--    only. Backfill: brand_read = is_read, preserving the current
--    badge state. The 0014 guard trigger is widened to allow
--    is_read AND brand_read to differ — message text, sender,
--    proof and campaign still can never be rewritten.
-- 3) P2 (brand scope): an overpaid difference (budget lowered
--    after payment) had no in-app refund request. refund_requests
--    gains kind ('rejected' | 'overpayment'); the old behaviour is
--    kind = 'rejected'. Status gains 'cancelled' so a superseded
--    request (e.g. an open overpayment request on a campaign that
--    is later rejected and refunded in full) can be closed honestly
--    instead of being marked 'sent' when no money was sent for it.
--    The one-open-request-per-campaign partial unique index is
--    unchanged.
-- 4) P1 (admin scope): unblocking a creator had a confirm but NO
--    reason, although the decided spec is "reason+confirm first".
--    creator_flags gains unblock_reason (free text, ≤200 chars at
--    the API layer, same pattern as campaign reject / budget edit).
--
-- Run once in the Supabase SQL Editor. Idempotent / safe to
-- re-run: add column if not exists + drop/create the trigger
-- function + drop constraint if exists. Never applied live from
-- here — Turn applies migrations in Supabase.
-- Never put the service_role key in the website code.

-- 1) Approval-time facts on submissions.
alter table public.submissions
  add column if not exists budget_capped boolean not null default false;
alter table public.submissions
  add column if not exists approval_views bigint;

-- 2) Brand-side read state on brand_messages (+ backfill).
alter table public.brand_messages
  add column if not exists brand_read boolean not null default false;

-- Drop the OLD 0014 guard FIRST: it only allows is_read to
-- change, so it blocks this backfill (brand_read changes).
-- The new widened trigger is installed below, after backfill.
drop trigger if exists brand_messages_read_guard on public.brand_messages;

update public.brand_messages
  set brand_read = is_read
  where brand_read = false and is_read = true;

-- Widen the 0014 guard: only the two read flags may differ from
-- the old row. Everything else (message, sender, proof_url,
-- campaign_id, user_id, created_at) is still immutable via update.
create or replace function public.enforce_brand_message_update()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  new_copy public.brand_messages;
begin
  -- Only the read flags may differ from the old row.
  new_copy := new;
  new_copy.is_read := old.is_read;
  new_copy.brand_read := old.brand_read;
  if new_copy is distinct from old then
    raise exception 'Only marking a message as read is allowed.';
  end if;
  return new;
end; $$;

drop trigger if exists brand_messages_read_guard on public.brand_messages;
create trigger brand_messages_read_guard
  before update on public.brand_messages
  for each row execute function public.enforce_brand_message_update();

-- 3) Refund request kind + 'cancelled' status.
alter table public.refund_requests
  add column if not exists kind text not null default 'rejected';

alter table public.refund_requests
  drop constraint if exists refund_requests_kind_check;
alter table public.refund_requests
  add constraint refund_requests_kind_check
  check (kind in ('rejected', 'overpayment'));

alter table public.refund_requests
  drop constraint if exists refund_requests_status_check;
alter table public.refund_requests
  add constraint refund_requests_status_check
  check (status in ('requested', 'sent', 'cancelled'));

-- 4) Unblock reason on creator_flags.
alter table public.creator_flags
  add column if not exists unblock_reason text;
