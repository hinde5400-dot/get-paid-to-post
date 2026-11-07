-- GET PAID TO POST — RLS hardening (0010)
--
-- Security audit findings (2026-11-07). The app uses the anon key
-- with the user's session everywhere (no service_role key exists in
-- the code), so RLS is the only thing standing between a signed-in
-- user and the database. These gaps were real:
--
-- 1) PRIVILEGE ESCALATION (critical): the "users update own" policy
--    had no column restriction, so ANY user could set is_admin = true
--    (or is_blocked / role) on their own row via the Supabase client
--    and become the owner. A trigger now blocks changes to is_admin,
--    is_blocked and role by anyone but the owner.
-- 2) FAKE LIVE CAMPAIGNS: the "campaigns insert authenticated"
--    policy let any signed-in user insert a campaign already live and
--    funded, straight onto Discover. Inserts now require
--    status = 'pending' AND is_funded = false.
-- 3) PENDING CAMPAIGNS WERE WORLD-READABLE: "campaigns public read"
--    was using (true), so anyone could read pending/unfunded
--    campaigns (brand, budget, rate) through the client. Public read
--    is now live + funded only; the owner reads everything through a
--    new admin policy.
-- 4) FAKE APPROVED SUBMISSIONS: the submissions insert policy only
--    checked user_id, so a user could insert a submission already
--    "approved" with invented views/earnings. Inserts now require
--    status pending/revoked and zero earnings/views/likes.
-- 5) FAKE PAID WITHDRAWALS: the withdrawals insert policy only
--    checked user_id, so a user could insert a withdrawal already
--    "paid". Inserts now require status = 'pending'.
-- 6) BALANCE INFLATION (critical): the "wallets own update" policy
--    let any user set their own available_balance to any number via
--    the client, then withdraw money never earned. A trigger now
--    allows non-owner wallet updates ONLY in the two legitimate
--    patterns: a hold release (pending -> available, same amount) or
--    a withdrawal (available -> withdrawn_total, same amount). The
--    owner bypasses the trigger (review credits, refunds).
-- 7) Users had no INSERT policy, so the onboarding fallback insert
--    could never work. Own-row insert is now allowed.
--
-- Already in place and unchanged: RLS enabled on every table, no
-- DELETE policy anywhere, admin read/update-all policies, owner-only
-- checks in every /api/admin route and the /admin page, and
-- passwords handled only by Supabase Auth (bcrypt) — no password is
-- stored anywhere in the app code.
--
-- Run 0008 BEFORE this file (the trigger below references
-- users.role). Run once in the Supabase SQL Editor.

-- 1) Privilege-change guard on users.
create or replace function public.prevent_privilege_escalation()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if (new.is_admin is distinct from old.is_admin)
     or (new.is_blocked is distinct from old.is_blocked)
     or (new.role is distinct from old.role) then
    if not public.is_admin() then
      raise exception 'Only the owner can change admin, blocked or role status.';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists users_privilege_guard on public.users;
create trigger users_privilege_guard
  before update on public.users
  for each row execute function public.prevent_privilege_escalation();

-- 6) Wallet-update guard: only the two legitimate patterns for
--    non-owners (hold release, withdrawal). Everything else is
--    rejected; the owner bypasses it.
create or replace function public.enforce_wallet_update()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  pending_delta numeric;
  available_delta numeric;
  withdrawn_delta numeric;
begin
  -- The owner may update any wallet (review credits, refunds).
  if public.is_admin() then
    return new;
  end if;
  pending_delta := new.pending_balance - old.pending_balance;
  available_delta := new.available_balance - old.available_balance;
  withdrawn_delta := new.withdrawn_total - old.withdrawn_total;
  -- Hold release: pending -> available, same amount.
  if pending_delta < 0
     and available_delta = -pending_delta
     and withdrawn_delta = 0 then
    return new;
  end if;
  -- Withdrawal: available -> withdrawn_total, same amount.
  if available_delta < 0
     and withdrawn_delta = -available_delta
     and pending_delta = 0 then
    return new;
  end if;
  raise exception 'Wallet balances can only change through withdrawals or hold releases.';
end; $$;

drop trigger if exists wallets_update_guard on public.wallets;
create trigger wallets_update_guard
  before update on public.wallets
  for each row execute function public.enforce_wallet_update();

-- 2) Campaign inserts must be pending + unfunded.
drop policy if exists "campaigns insert authenticated" on public.campaigns;
create policy "campaigns insert authenticated" on public.campaigns
  for insert with check (
    auth.uid() is not null
    and status = 'pending'
    and is_funded = false
  );

-- 3) Public campaign reads: live + funded only; owner reads all.
drop policy if exists "campaigns public read" on public.campaigns;
create policy "campaigns public read" on public.campaigns
  for select using (is_funded = true and status = 'live');
create policy "admins read all campaigns" on public.campaigns
  for select using (public.is_admin());

-- 4) Submission inserts: pending/revoked, zero numbers.
drop policy if exists "submissions own insert" on public.submissions;
create policy "submissions own insert" on public.submissions
  for insert with check (
    auth.uid() = user_id
    and status in ('pending', 'revoked')
    and earnings = 0
    and views = 0
    and likes = 0
  );

-- 5) Withdrawal inserts: pending only.
drop policy if exists "withdrawals own insert" on public.withdrawals;
create policy "withdrawals own insert" on public.withdrawals
  for insert with check (auth.uid() = user_id and status = 'pending');

-- 7) Own-row user insert (onboarding fallback).
drop policy if exists "users insert own" on public.users;
create policy "users insert own" on public.users
  for insert with check (auth.uid() = id);
