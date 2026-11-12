-- GET PAID TO POST — Round 6 audit fixes (0044)
--
-- Two small schema additions, both backward-compatible (no
-- renames, no drops of live data). Code that uses the new
-- columns must read them as optional with fallbacks until this
-- migration is applied live — the app must not crash on the
-- old shape.
--
-- 1) A8 (brand scope): a brand filing a 'rejected' refund while
--    its own overpayment request was still open got a bare 409
--    ("Ask the admin on Discord to close it first"), because
--    there was no brand UPDATE policy on refund_requests
--    (0041) and the one-open-request-per-campaign index blocked
--    the insert. A brand can now cancel its OWN open
--    ('requested') request, and nothing else: the policy below
--    only allows setting status to 'cancelled' on a row the
--    brand owns that is still open. The refund route cancels
--    the open overpayment row itself (same status-guarded
--    update the owner cancel action uses) before filing the
--    full-budget refund, so the brand no longer needs the admin
--    for this step. The owner keeps full access via the
--    "admins write refund_requests" policy (0041).
--    NOTE: RLS policies cannot restrict WHICH columns an update
--    touches — the policy pins the old status ('requested')
--    and the new status ('cancelled') and the owner. The route
--    only ever sets status + updated_at on this path; no amount,
--    payment TxID or campaign can be changed through it.
-- 2) C4 (creator scope): My Posts must render an approved clip's
--    earnings breakdown from the values in force AT APPROVAL
--    time, not the campaign's current rate/cap. The review
--    route now stores submissions.approval_rate (the rate per
--    1k views at approval) and submissions.approval_max_payout
--    (the max payout per post at approval) alongside the 0043
--    facts. Nullable with no default: rows approved before
--    0044 simply have no approval-time rate/cap and render the
--    plain breakdown, as before.
--
-- Run once in the Supabase SQL Editor. Idempotent / safe to
-- re-run: add column if not exists + drop policy if exists.
-- Never applied live from here — Turn applies migrations in
-- Supabase. Never put the service_role key in the website code.

-- 1) Brand can cancel its own open refund request.
drop policy if exists "refund_requests brand cancel own open"
  on public.refund_requests;
create policy "refund_requests brand cancel own open"
  on public.refund_requests
  for update
  using (user_id = auth.uid() and status = 'requested')
  with check (user_id = auth.uid() and status = 'cancelled');

-- 2) Approval-time rate/cap facts on submissions.
alter table public.submissions
  add column if not exists approval_rate numeric;
alter table public.submissions
  add column if not exists approval_max_payout numeric;
