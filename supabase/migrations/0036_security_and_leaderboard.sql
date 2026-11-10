-- GET PAID TO POST — security + leaderboard + atomic budgets (0036)
--
-- Fix Batch 2 (2026-11-10, round-2 audit). FIVE sections:
--
-- (1) API P0-3 + P1-1 — revoke the anon grant on every sensitive
--     SECURITY DEFINER helper RPC. The anon key is public (it ships
--     in the browser bundle), so anyone could call these directly
--     and bypass the CRON_SECRET-gated routes entirely: forge any
--     pending clip's views/likes/comments (apply_view_refresh),
--     read every creator's TikTok tokens (list_tiktok_tokens_for_
--     refresh), overwrite any creator's tokens (save_tiktok_tokens),
--     or delete any eligible ended / expired-pending campaign
--     (cleanup_ended_campaign, cleanup_expired_pending_campaign).
--     All of them are now authenticated-only. The revoke is from
--     BOTH anon and public (anon is implicitly a member of public,
--     so revoking from anon alone would not remove a public grant).
--
--     *** CRON FOLLOW-UP — READ BEFORE APPLYING ***
--     The two GitHub Actions cron routes call these RPCs with the
--     anon key and NO user session (getServerClient, CRON_SECRET
--     header only), so after this migration BOTH CRON JOBS BREAK
--     until they are changed to run with an authenticated session
--     (or a DB-side secret mechanism is built — this migration
--     cannot do that: CRON_SECRET lives only in Vercel env, and
--     the service_role key is never used anywhere):
--       - /api/cron/refresh-views: list_pending_submissions_for_
--         refresh throws -> route 500s, views stop refreshing.
--         (The owner's manual /api/admin/refresh-views keeps
--         working — it runs as an authenticated owner session.
--         Submit-flow save_tiktok_tokens calls keep working too
--         — they run as the signed-in creator.)
--       - /api/cron/cleanup-ended-campaigns: list_cleanup_candidates
--         / list_expired_pending_campaigns fail, AND the storage
--         delete policies that call campaign_eligible_for_cleanup,
--         campaign_expired_unpaid_pending, campaign_image_cleanup_
--         allowed and campaign_image_is_orphan can no longer
--         evaluate for anon callers, so storage.remove is denied
--         as well. Ended-campaign auto-delete and 7-day pending
--         expiry both stop until the cron path is fixed.
--     Apply this migration ONLY together with that cron follow-up
--     (parent decision), or the jobs silently stop. What keeps
--     working after this migration: release_matured_holds (called
--     from the admin review route and lazy wallet reads, both
--     authenticated) and the admin manual refresh.
--
--     Deliberately NOT revoked:
--       - campaign_stats(uuid): read-only public aggregates,
--         legitimately called for logged-out visitors on public
--         campaign pages (lib/data.ts getCampaignStats); the data
--         is public anyway (campaigns are publicly readable).
--       - is_admin(): no grant statement exists for it (default
--         public execute); it is a read-only self-check used
--         inside RLS policies, so revoking anon could break policy
--         evaluation for anonymous reads. Harmless as-is.
--       - claim_oauth_role(text): already authenticated-only
--         (migration 0034).
--     No browser (client-component) call site exists for any
--     revoked RPC — every caller is a server route or lib/views.
--
-- (2) API P1-10 — first-account-owner race. handle_new_user()
--     checked "does an admin exist" then inserted is_admin = NOT
--     admin_exists with no lock, so two simultaneous first signups
--     could both become admin. Fixed with a partial unique index
--     (at most one is_admin = true row can ever exist) PLUS an
--     advisory lock serialising concurrent signups in the trigger,
--     PLUS a unique_violation rescue that retries as non-admin so
--     a lost race never fails the signup. Behaviour otherwise
--     unchanged (role/brand_name from signup metadata, wallet row).
--     PRECONDITION: the live database must have at most one admin
--     before applying, or the index creation fails. (Turn is the
--     only admin; verify with: select count(*) from public.users
--     where is_admin = true; — expect 1.)
--
-- (3) API P1-2 — duplicate-link auto-reject could never be stored:
--     "submissions own insert" required status = 'pending', but the
--     submissions route inserts a duplicate link as status =
--     'rejected', rejection_reason = 'duplicate', so the insert
--     failed RLS and the whole bundle rolled back. The policy now
--     also allows an own insert with status = 'rejected' AND
--     rejection_reason = 'duplicate' (and nothing else — zero
--     earnings/views/likes/comments still required in both cases).
--
-- Sections (4) and (5) below: (4) the public leaderboard RPCs
-- (Money P0-1), (5) the atomic campaign-budget RPCs (API P0-2
-- support).
--
-- Run once in the Supabase SQL Editor. Do NOT edit old migrations.

-- ================================================================
-- (1) Revoke anon on the sensitive helper RPCs (P0-3 + P1-1).
-- ================================================================
--
-- View refresh (0018 / 0019 / 0022). Callers: lib/views/refresh.ts
-- only — the 3-hour cron (anon key) and the owner's manual refresh
-- (authenticated). Both apply_view_refresh overloads are revoked:
-- the 2-arg one from 0018 still exists as a separate overload
-- alongside the 4-arg one from 0022. apply_view_refresh keeps its
-- pending-only + greatest(0, ...) guards — they limit damage to
-- still-pending rows, but they never stopped forgery, which is why
-- the grant itself is removed.

revoke execute on function public.apply_view_refresh(uuid, bigint)
  from anon, public;
grant execute on function public.apply_view_refresh(uuid, bigint)
  to authenticated;

revoke execute on function public.apply_view_refresh(uuid, bigint, bigint, bigint)
  from anon, public;
grant execute on function public.apply_view_refresh(uuid, bigint, bigint, bigint)
  to authenticated;

revoke execute on function public.list_pending_submissions_for_refresh()
  from anon, public;
grant execute on function public.list_pending_submissions_for_refresh()
  to authenticated;

revoke execute on function public.list_tiktok_tokens_for_refresh()
  from anon, public;
grant execute on function public.list_tiktok_tokens_for_refresh()
  to authenticated;

revoke execute on function public.save_tiktok_tokens(uuid, text, text, text, timestamptz, timestamptz)
  from anon, public;
grant execute on function public.save_tiktok_tokens(uuid, text, text, text, timestamptz, timestamptz)
  to authenticated;

revoke execute on function public.list_youtube_channels_for_refresh()
  from anon, public;
grant execute on function public.list_youtube_channels_for_refresh()
  to authenticated;

-- Cleanup (0023 / 0027 / 0030 / 0032). Callers: the daily cleanup
-- cron route only (anon key). The two predicate functions and the
-- two image helpers are ALSO called from storage delete policies,
-- which evaluate as the caller's role — revoking anon closes the
-- anon storage-delete path too (see header follow-up note).
-- list_cleanup_candidates / list_expired_pending_campaigns are
-- read-only, but they exist only for the cron and expose internal
-- storage paths, so they lose anon as well.

revoke execute on function public.campaign_eligible_for_cleanup(uuid)
  from anon, public;
grant execute on function public.campaign_eligible_for_cleanup(uuid)
  to authenticated;

revoke execute on function public.list_cleanup_candidates()
  from anon, public;
grant execute on function public.list_cleanup_candidates()
  to authenticated;

revoke execute on function public.cleanup_ended_campaign(uuid)
  from anon, public;
grant execute on function public.cleanup_ended_campaign(uuid)
  to authenticated;

revoke execute on function public.campaign_expired_unpaid_pending(uuid)
  from anon, public;
grant execute on function public.campaign_expired_unpaid_pending(uuid)
  to authenticated;

revoke execute on function public.list_expired_pending_campaigns()
  from anon, public;
grant execute on function public.list_expired_pending_campaigns()
  to authenticated;

revoke execute on function public.cleanup_expired_pending_campaign(uuid)
  from anon, public;
grant execute on function public.cleanup_expired_pending_campaign(uuid)
  to authenticated;

revoke execute on function public.campaign_image_cleanup_allowed(text)
  from anon, public;
grant execute on function public.campaign_image_cleanup_allowed(text)
  to authenticated;

revoke execute on function public.campaign_image_is_orphan(text)
  from anon, public;
grant execute on function public.campaign_image_is_orphan(text)
  to authenticated;

-- Hold release (0011 / 0031). Moves wallet money between balances
-- and must never be callable anonymously. Callers are authenticated
-- only: the admin review route and the lazy wallet-read call in
-- lib/data.ts (signed-in users), so revoking anon breaks nothing.

revoke execute on function public.release_matured_holds()
  from anon, public;
grant execute on function public.release_matured_holds()
  to authenticated;

-- ================================================================
-- (2) First-account-owner race (P1-10).
-- ================================================================

-- Backstop: at most one admin row can ever exist.
create unique index if not exists users_single_admin
  on public.users (is_admin) where is_admin = true;

-- Rewritten trigger function: same behaviour as migration 0008
-- (role + brand_name from signup metadata, wallet row), plus
-- (a) a transaction-scoped advisory lock on a fixed key, so two
--     concurrent first signups serialise inside the trigger and
--     the second one sees the admin that the first one created;
-- (b) a unique_violation rescue: if the insert still collides
--     with the partial index above, the signup is retried as a
--     plain non-admin instead of failing. Without the rescue the
--     index alone would turn a lost race into a broken signup.
-- The lock key (20261110) is used nowhere else in the repo.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  admin_exists boolean;
  new_role text;
begin
  perform pg_advisory_xact_lock(20261110);
  select exists (select 1 from public.users where is_admin = true)
    into admin_exists;
  new_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'creator');
  if new_role not in ('creator', 'brand') then
    new_role := 'creator';
  end if;
  begin
    insert into public.users (id, email, is_admin, full_name, role, brand_name)
      values (
        new.id,
        new.email,
        not admin_exists,
        new.raw_user_meta_data->>'full_name',
        new_role,
        nullif(new.raw_user_meta_data->>'brand_name', '')
      )
      on conflict (id) do update
        set full_name = coalesce(public.users.full_name, excluded.full_name),
            role = coalesce(public.users.role, excluded.role),
            brand_name = coalesce(public.users.brand_name, excluded.brand_name);
  exception when unique_violation then
    -- Lost the owner race after the check: never fail the signup,
    -- retry as a non-admin. Only reachable on a race (the lock
    -- above serialises the normal path); the partial index is what
    -- makes the violation possible at all.
    insert into public.users (id, email, is_admin, full_name, role, brand_name)
      values (
        new.id,
        new.email,
        false,
        new.raw_user_meta_data->>'full_name',
        new_role,
        nullif(new.raw_user_meta_data->>'brand_name', '')
      )
      on conflict (id) do update
        set full_name = coalesce(public.users.full_name, excluded.full_name),
            role = coalesce(public.users.role, excluded.role),
            brand_name = coalesce(public.users.brand_name, excluded.brand_name);
  end;
  insert into public.wallets (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end; $$;

-- ================================================================
-- (3) Duplicate-reject inserts (P1-2).
-- ================================================================
--
-- The submissions route inserts a duplicate link as status =
-- 'rejected', rejection_reason = 'duplicate' (views/likes/
-- comments/earnings all 0 — same as a pending insert). The old
-- policy allowed pending only, so the insert failed RLS and the
-- bundle rolled back, losing its legitimate links. The rejected
-- branch is deliberately narrow: only rejection_reason =
-- 'duplicate', never any other reason.

drop policy if exists "submissions own insert" on public.submissions;
create policy "submissions own insert" on public.submissions
  for insert with check (
    auth.uid() = user_id
    and earnings = 0
    and views = 0
    and likes = 0
    and comments = 0
    and (
      status = 'pending'
      or (status = 'rejected' and rejection_reason = 'duplicate')
    )
  );

-- ================================================================
-- (4) Public leaderboard (Money P0-1).
-- ================================================================
--
-- The Win Board showed $0.00 / "nobody has earned anything" to
-- every non-admin forever, because topClippersFromRows returned []
-- unless is_admin — submissions are RLS-readable only by their
-- owner and the admin, so no public query could ever build a real
-- board. These two SECURITY DEFINER functions return ONLY public
-- aggregates, so they are safe to grant to anon + authenticated:
-- no user ids, no wallet data, no emails, no per-clip rows.
--   - get_public_leaderboard: one row per creator with approved
--     earnings (total_earned > 0), ordered by total earned desc,
--     top 10. p_campaign_id null = global board; set = that
--     campaign's board. total_views is a summed aggregate, kept
--     so the board can still show views per row.
--   - get_total_paid_out: sum of final_amount over withdrawals
--     the owner marked status = 'paid'. (Withdrawals are never
--     deleted, so this stays true even after a campaign's
--     submissions are auto-deleted — the board's "total paid"
--     must NOT be derived from submissions.)

create or replace function public.get_public_leaderboard(
  p_campaign_id uuid default null
)
returns table (
  display_name text,
  total_earned numeric,
  approved_clips integer,
  total_views bigint
)
language sql security definer
set search_path = public as $$
  select
    coalesce(nullif(btrim(u.full_name), ''), 'Creator') as display_name,
    coalesce(sum(s.earnings), 0)::numeric as total_earned,
    count(*)::integer as approved_clips,
    coalesce(sum(s.views), 0)::bigint as total_views
  from public.submissions s
  join public.users u on u.id = s.user_id
  where s.status = 'approved'
    and (p_campaign_id is null or s.campaign_id = p_campaign_id)
  group by s.user_id, u.full_name
  having coalesce(sum(s.earnings), 0) > 0
  order by total_earned desc, total_views desc
  limit 10;
$$;

revoke execute on function public.get_public_leaderboard(uuid)
  from public;
grant execute on function public.get_public_leaderboard(uuid)
  to anon, authenticated;

create or replace function public.get_total_paid_out()
returns numeric
language sql security definer
set search_path = public as $$
  select coalesce(sum(final_amount), 0)::numeric
  from public.withdrawals
  where status = 'paid';
$$;

revoke execute on function public.get_total_paid_out()
  from public;
grant execute on function public.get_total_paid_out()
  to anon, authenticated;

-- ================================================================
-- (5) Atomic campaign-budget RPCs (API P0-2 support).
-- ================================================================
--
-- The admin review route updated budget_left / paid_out with a
-- stale read + absolute write, so two concurrent approvals could
-- double-spend the brand-funded budget. These two SECURITY
-- DEFINER functions do the budget change as ONE atomic UPDATE
-- with the guard in the WHERE clause, so the check and the write
-- cannot race. The API worker calls them from the review and
-- campaign-budget routes; the exact signatures below must not
-- change. Both raise unless the caller is the admin (is_admin()),
-- and both are granted to authenticated ONLY — never anon.
--   - decrement_campaign_budget: moves p_amount from budget_left
--     to paid_out in one step. A non-positive amount is not an
--     error the caller should see as a crash: it returns
--     (false, current budget_left, current paid_out), the same
--     as an insufficient budget. A campaign that does not exist
--     returns (false, null, null).
--   - set_campaign_budget_total: changes the campaign's total
--     budget while keeping the already-spent amount fixed, so
--     budget_left moves by the same delta as the total. Refused
--     (ok = false) when the new total is below what is already
--     spent or not positive. Columns are budget_total /
--     budget_left / paid_out (migration 0001).

create or replace function public.decrement_campaign_budget(
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
    raise exception 'decrement_campaign_budget: admin only';
  end if;

  update public.campaigns
    set budget_left = budget_left - p_amount,
        paid_out = paid_out + p_amount
    where id = p_campaign_id
      and p_amount is not null
      and p_amount > 0
      and budget_left >= p_amount;

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

revoke execute on function public.decrement_campaign_budget(uuid, numeric)
  from public;
grant execute on function public.decrement_campaign_budget(uuid, numeric)
  to authenticated;

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
  -- the amount already spent — stays exactly fixed.
  update public.campaigns
    set budget_total = p_new_total,
        budget_left = p_new_total - (budget_total - budget_left)
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
