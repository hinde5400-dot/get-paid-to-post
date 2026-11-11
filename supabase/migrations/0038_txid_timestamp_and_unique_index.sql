-- GET PAID TO POST — money races + TxID timestamp + TxID uniqueness (0038)
--
-- Round-3 audit fix batch (2026-11-11). FIVE sections:
--
-- (1) P1-7 — payment_tx_submitted_at: when a brand pastes a TxID,
--     the payment route stamps the server time. A pending campaign
--     whose TxID was never verified (verification only happens at
--     approve time, which flips the status) now expires 7 days
--     after the TxID was submitted — a garbage 64-hex hash no
--     longer defeats the 7-day expiry forever. The predicate in
--     section (4) and isExpiredUnpaidPending in src/lib/data.ts
--     implement the SAME rule, so the API routes and the daily
--     cron can never drift apart. A TxID correction re-stamps the
--     time (the correction is a new submission of payment proof).
--     The 0013 brand-payment guard is widened in (1b) to allow
--     the timestamp to change alongside the TxID — without that
--     the brand's own payment update would be rejected by the
--     trigger.
--
-- (2) P2-7 — unique partial index on lower(payment_tx_id): one
--     real payment cannot fund two campaigns. The app-level clash
--     checks (payment route + admin approve) stay — the index is
--     the backstop for two concurrent same-TxID submits. Partial
--     (only non-empty TxIDs) so campaigns with no payment are
--     unaffected. PRECONDITION: no two campaigns share a TxID
--     today (0 live campaigns carry a TxID), or index creation
--     fails. Case-insensitive via lower() — the app stores TxIDs
--     lowercase, but a legacy mixed-case row must still collide.
--
-- (3) P1-2 / P1-3 / P1-4 — atomic wallet RPCs. The review and
--     withdrawal routes did absolute read-then-write wallet
--     updates, so concurrent approves / rejects / refunds could
--     silently lose or double-apply money. These four SECURITY
--     DEFINER functions do each money move as ONE atomic UPDATE
--     with the guard in the WHERE clause (or a row lock + compute
--     + write inside one transaction, for the reversal, which
--     needs the pending-first split). All check is_admin() inside
--     — the same guard pattern as decrement_campaign_budget /
--     set_campaign_budget_total in migration 0036 — and all are
--     granted to authenticated ONLY, never anon. No browser
--     (client-component) call site exists for any of them; every
--     caller is an owner-only server route.
--       - credit_wallet_pending: pending_balance += amount.
--       - reverse_wallet_earnings: take back a rejected approved
--         clip's earnings, pending balance first, then available;
--         returns how much was actually reversed and the
--         shortfall (already withdrawn / no wallet).
--       - restore_campaign_budget: budget_left += amount,
--         paid_out -= amount (floored at 0).
--       - refund_wallet_withdrawal: available += amount,
--         withdrawn_total -= amount (floored at 0).
--     Amounts are rounded to cents inside the functions, matching
--     the app's Math.round(x * 100) / 100. A non-positive amount
--     is not an error the caller should see as a crash: the
--     function returns ok = false, the same as a missing row.
--
-- (4) P1-7 (cron side) — the 0030 expiry predicate and its list
--     function are redefined to the new rule: a pending campaign
--     expires 7 days after creation when it has NO TxID, and 7
--     days after the TxID was submitted when it has one. Legacy
--     rows with a TxID but no timestamp fall back to created_at,
--     so a pre-0038 TxID can no longer defeat expiry. The storage
--     delete policy in 0030 calls the predicate, so it picks the
--     new rule up automatically. list_expired_pending_campaigns
--     is byte-identical to its 0036 version except the WHERE
--     clause now calls the predicate (same guard, same columns).
--     cleanup_expired_pending_campaign (0036) already calls the
--     predicate, so it needs no change.
--
-- (5) P2-6 — set_campaign_budget_total (0036) now recomputes the
--     15% platform fee atomically with the budget: platform_fee =
--     round(new_total * 0.15, 2), the same formula as
--     platformFeeFor() in src/lib/money.ts (15% flat, on top of
--     the budget — never taken out of it). The route keeps its own
--     fee update as a reconciliation write of the same value, so
--     a database that has 0036 but not 0038 yet still gets the
--     right fee. Same signature, same is_admin() guard, same
--     grants as 0036.
--
-- Run once in the Supabase SQL Editor. Do NOT edit old migrations.

-- ================================================================
-- (1) TxID submission timestamp (P1-7).
-- ================================================================

alter table public.campaigns
  add column if not exists payment_tx_submitted_at timestamptz;

-- (1b) The brand payment guard (migration 0013) rejects any
--     non-owner update that changes anything but payment_tx_id —
--     the payment route's update would now fail for the brand
--     itself, because it also stamps payment_tx_submitted_at.
--     The guard is widened to allow exactly those two columns to
--     change together (the timestamp is always set alongside the
--     TxID, by the server, on a pending campaign). The owner
--     still bypasses the trigger entirely.
create or replace function public.enforce_campaign_payment_update()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  new_copy public.campaigns;
begin
  if public.is_admin() then
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'Only a pending campaign can record a payment.';
  end if;
  -- Only payment_tx_id and its submission timestamp may differ
  -- from the old row.
  new_copy := new;
  new_copy.payment_tx_id := old.payment_tx_id;
  new_copy.payment_tx_submitted_at := old.payment_tx_submitted_at;
  if new_copy is distinct from old then
    raise exception 'Only the payment Transaction ID can be changed by a brand.';
  end if;
  return new;
end; $$;

-- ================================================================
-- (2) TxID uniqueness backstop (P2-7).
-- ================================================================

create unique index if not exists campaigns_payment_tx_id_unique
  on public.campaigns (lower(payment_tx_id))
  where payment_tx_id is not null and payment_tx_id <> '';

-- ================================================================
-- (3) Atomic wallet RPCs (P1-2 / P1-3 / P1-4).
-- ================================================================

-- P1-2: credit a creator's pending (72h-held) balance. The old
-- code read pending_balance once and wrote an absolute value, so
-- two concurrent approves for the same creator both read the same
-- balance and the second write overwrote the first credit. The
-- increment happens inside the database here, so concurrent
-- credits can no longer lose one.
create or replace function public.credit_wallet_pending(
  p_user_id uuid,
  p_amount numeric
)
returns table (
  ok boolean,
  new_pending_balance numeric
)
language plpgsql security definer
set search_path = public as $$
declare
  v_pending numeric;
begin
  if not public.is_admin() then
    raise exception 'credit_wallet_pending: admin only';
  end if;

  update public.wallets
    set pending_balance =
      round(coalesce(pending_balance, 0) + p_amount, 2)
    where user_id = p_user_id
      and p_amount is not null
      and p_amount > 0;

  if found then
    select pending_balance into v_pending
    from public.wallets
    where user_id = p_user_id;
    return query select true, v_pending;
    return;
  end if;

  return query select false, null::numeric;
end; $$;

revoke execute on function public.credit_wallet_pending(uuid, numeric)
  from public;
grant execute on function public.credit_wallet_pending(uuid, numeric)
  to authenticated;

-- P1-3: reverse a rejected approved clip's earnings. Takes from
-- the pending (held) balance first, then from the available
-- balance if the hold already matured — the same split the
-- review route used to compute by hand. The row is locked
-- (FOR UPDATE) so the read, the split and the write cannot race
-- a concurrent credit, debit or second reversal. shortfall =
-- money that could NOT be clawed back (already withdrawn, or no
-- wallet row at all): the caller restores only (amount -
-- shortfall) to the campaign budget, so withdrawn money can
-- never be paid out a second time. A missing wallet row returns
-- ok = false with shortfall = the full amount.
create or replace function public.reverse_wallet_earnings(
  p_user_id uuid,
  p_amount numeric
)
returns table (
  ok boolean,
  reversed numeric,
  shortfall numeric,
  new_pending_balance numeric,
  new_available_balance numeric
)
language plpgsql security definer
set search_path = public as $$
declare
  v_pending numeric;
  v_available numeric;
  v_from_pending numeric;
  v_from_available numeric;
  v_reversed numeric;
  v_shortfall numeric;
begin
  if not public.is_admin() then
    raise exception 'reverse_wallet_earnings: admin only';
  end if;
  if p_amount is null or p_amount <= 0 then
    return query
      select false, 0::numeric, 0::numeric, null::numeric, null::numeric;
    return;
  end if;

  select pending_balance, available_balance
    into v_pending, v_available
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    return query
      select false, 0::numeric, round(p_amount, 2),
             null::numeric, null::numeric;
    return;
  end if;

  v_pending := coalesce(v_pending, 0);
  v_available := coalesce(v_available, 0);
  v_from_pending := least(v_pending, p_amount);
  v_from_available := least(v_available, p_amount - v_from_pending);
  v_reversed := round(v_from_pending + v_from_available, 2);
  v_shortfall := round(p_amount - v_reversed, 2);

  update public.wallets
    set pending_balance = round(v_pending - v_from_pending, 2),
        available_balance = round(v_available - v_from_available, 2)
    where user_id = p_user_id;

  select pending_balance, available_balance
    into v_pending, v_available
  from public.wallets
  where user_id = p_user_id;
  return query
    select true, v_reversed, v_shortfall, v_pending, v_available;
end; $$;

revoke execute on function public.reverse_wallet_earnings(uuid, numeric)
  from public;
grant execute on function public.reverse_wallet_earnings(uuid, numeric)
  to authenticated;

-- P1-3: restore a campaign's budget after a reject-after-approve.
-- The old code read budget_left / paid_out once and wrote absolute
-- values, so two concurrent rejects both restored the same money.
-- paid_out is floored at 0: a legacy row whose paid_out never
-- tracked the earnings must not go negative.
create or replace function public.restore_campaign_budget(
  p_campaign_id uuid,
  p_amount numeric
)
returns table (
  ok boolean,
  new_budget_left numeric,
  new_paid_out numeric
)
language plpgsql security definer
set search_path = public as $$
declare
  v_left numeric;
  v_paid numeric;
begin
  if not public.is_admin() then
    raise exception 'restore_campaign_budget: admin only';
  end if;

  update public.campaigns
    set budget_left = round(budget_left + p_amount, 2),
        paid_out = greatest(0, round(paid_out - p_amount, 2))
    where id = p_campaign_id
      and p_amount is not null
      and p_amount > 0;

  if found then
    select budget_left, paid_out into v_left, v_paid
    from public.campaigns
    where id = p_campaign_id;
    return query select true, v_left, v_paid;
    return;
  end if;

  select budget_left, paid_out into v_left, v_paid
  from public.campaigns
  where id = p_campaign_id;
  if not found then
    return query select false, null::numeric, null::numeric;
    return;
  end if;
  return query select false, v_left, v_paid;
end; $$;

revoke execute on function public.restore_campaign_budget(uuid, numeric)
  from public;
grant execute on function public.restore_campaign_budget(uuid, numeric)
  to authenticated;

-- P1-4: refund a rejected withdrawal. The status flip is already
-- guarded first in the route (exactly one caller ever reaches
-- here), but the refund itself was an absolute read-then-write:
-- a creator's own withdrawal debit landing between the admin's
-- read and write was overwritten and the debit vanished while
-- its withdrawal row still existed. withdrawn_total is floored
-- at 0: a legacy row created before the request-time debit never
-- moved withdrawn_total, so there is nothing to take back.
create or replace function public.refund_wallet_withdrawal(
  p_user_id uuid,
  p_amount numeric
)
returns table (
  ok boolean,
  new_available_balance numeric,
  new_withdrawn_total numeric
)
language plpgsql security definer
set search_path = public as $$
declare
  v_available numeric;
  v_withdrawn numeric;
begin
  if not public.is_admin() then
    raise exception 'refund_wallet_withdrawal: admin only';
  end if;

  update public.wallets
    set available_balance =
          round(coalesce(available_balance, 0) + p_amount, 2),
        withdrawn_total =
          greatest(0, round(coalesce(withdrawn_total, 0) - p_amount, 2))
    where user_id = p_user_id
      and p_amount is not null
      and p_amount >= 0;

  if found then
    select available_balance, withdrawn_total
      into v_available, v_withdrawn
    from public.wallets
    where user_id = p_user_id;
    return query select true, v_available, v_withdrawn;
    return;
  end if;

  return query select false, null::numeric, null::numeric;
end; $$;

revoke execute on function public.refund_wallet_withdrawal(uuid, numeric)
  from public;
grant execute on function public.refund_wallet_withdrawal(uuid, numeric)
  to authenticated;

-- ================================================================
-- (4) Expiry predicate + list function follow the new rule (P1-7).
-- ================================================================
--
-- THE RULE (exact, same as isExpiredUnpaidPending in
-- src/lib/data.ts): status = 'pending' AND
--   - no TxID: created_at is 7+ days old, OR
--   - TxID on file but never verified: payment_tx_submitted_at
--     is 7+ days old (TxID + no timestamp falls back to
--     created_at, so a pre-0038 TxID cannot defeat expiry).
-- "Verified" means approved: approval flips the status, so any
-- row still pending with a TxID is by definition unverified.

create or replace function public.campaign_expired_unpaid_pending(
  p_campaign_id uuid
)
returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_campaign public.campaigns%rowtype;
  v_paid_at timestamptz;
begin
  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id;
  if not found then return false; end if;

  if v_campaign.status <> 'pending' then return false; end if;

  -- Never paid at all: 7+ days after creation.
  if v_campaign.payment_tx_id is null
     or v_campaign.payment_tx_id = '' then
    if v_campaign.created_at >= now() - interval '7 days' then
      return false;
    end if;
    return true;
  end if;

  -- TxID on file but never verified: 7+ days after the TxID was
  -- submitted. Legacy rows with a TxID but no timestamp fall back
  -- to created_at.
  v_paid_at := coalesce(
    v_campaign.payment_tx_submitted_at,
    v_campaign.created_at
  );
  if v_paid_at >= now() - interval '7 days' then
    return false;
  end if;

  return true;
end; $$;

-- list_expired_pending_campaigns: byte-identical to its 0036
-- version (same guard, same columns) except the WHERE clause now
-- calls the predicate above instead of inlining the old
-- "no TxID" rule. Grants are unchanged (create or replace keeps
-- them: authenticated only, never anon).
create or replace function public.list_expired_pending_campaigns()
returns table (
  campaign_id uuid,
  title text,
  created_at timestamptz,
  messages_count bigint,
  storage_paths text[],
  image_paths text[]
)
language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_privileged_caller() then
    raise exception 'list_expired_pending_campaigns: admin or cron service account only';
  end if;
  return query
  select
    c.id,
    c.title,
    c.created_at,
    count(m.id) as messages_count,
    coalesce(
      (
        select array_agg(o.name order by o.name)
        from storage.objects o
        where o.bucket_id = 'brand-proofs'
          and o.name like c.id::text || '/%'
      ),
      '{}'::text[]
    ) as storage_paths,
    array_remove(
      array[
        max(substring(c.logo_url from '/campaign-images/(.+)$')),
        max(substring(c.thumbnail_url from '/campaign-images/(.+)$'))
      ],
      null
    ) as image_paths
  from public.campaigns c
  left join public.brand_messages m on m.campaign_id = c.id
  where public.campaign_expired_unpaid_pending(c.id)
  group by c.id, c.title, c.created_at
  order by c.created_at asc;
end; $$;

-- ================================================================
-- (5) Budget-total RPC recomputes the 15% platform fee (P2-6).
-- ================================================================
--
-- Same signature, guard and grants as migration 0036; the only
-- change is the SET clause, which now also sets platform_fee =
-- round(new_total * 0.15, 2) — the 15% flat fee on top of the
-- budget, matching platformFeeFor() in src/lib/money.ts. A budget
-- edit can no longer leave a stale fee behind even if the
-- route's separate fee update fails.

create or replace function public.set_campaign_budget_total(
  p_campaign_id uuid,
  p_new_total numeric
)
returns table (
  ok boolean,
  new_budget_left numeric,
  new_budget_total numeric
)
language plpgsql security definer
set search_path = public as $$
declare
  v_left numeric;
  v_total numeric;
begin
  if not public.is_admin() then
    raise exception 'set_campaign_budget_total: admin only';
  end if;

  -- SET expressions see the OLD row: budget_left moves by the
  -- same delta as the total, so (budget_total - budget_left) —
  -- the amount already spent — stays exactly fixed. The fee is
  -- recomputed from the NEW total in the same statement.
  update public.campaigns
    set budget_total = p_new_total,
        budget_left = p_new_total - (budget_total - budget_left),
        platform_fee = round(p_new_total * 0.15, 2)
    where id = p_campaign_id
      and p_new_total is not null
      and p_new_total > 0
      and p_new_total >= (budget_total - budget_left);

  if found then
    select budget_left, budget_total into v_left, v_total
    from public.campaigns
    where id = p_campaign_id;
    return query select true, v_left, v_total;
    return;
  end if;

  select budget_left, budget_total into v_left, v_total
  from public.campaigns
  where id = p_campaign_id;
  if not found then
    return query select false, null::numeric, null::numeric;
    return;
  end if;
  return query select false, v_left, v_total;
end; $$;

revoke execute on function public.set_campaign_budget_total(uuid, numeric)
  from public;
grant execute on function public.set_campaign_budget_total(uuid, numeric)
  to authenticated;
