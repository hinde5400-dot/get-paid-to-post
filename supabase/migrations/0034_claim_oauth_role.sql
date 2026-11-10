-- GET PAID TO POST — claim the OAuth signup role on public.users (0034)
--
-- GOOGLE LOGIN FIX (2026-11-10): signInWithOAuth cannot carry user
-- metadata, so a Google brand signup had no way to put role='brand'
-- into public.users — migration 0008's handle_new_user trigger only
-- copies the role from signup metadata, which OAuth never sends.
-- The first Google-login build worked around it by storing the role
-- in auth metadata (updateUser) and reading it back with a fallback
-- in /brands and /dashboard. That split the role across two stores
-- AND opened a self-promotion hole: any logged-in user can write
-- their own auth metadata from the browser console
-- (updateUser({ data: { role: 'brand' } })), so the fallback let
-- anyone promote themselves to 'brand' and skip the migration
-- 0010 privilege guard. Blast radius was small (a pending campaign
-- still needs real USDT payment + the owner's approval), but the
-- fallback must not ship. This migration closes it properly:
--
-- 1) claim_oauth_role(p_role) — a SECURITY DEFINER function the
--    auth callback calls once, right after the OAuth sign-in.
--    Guards, all server-side (nothing here trusts the caller):
--    - p_role must be 'creator' or 'brand' only.
--    - the caller must be signed in (auth.uid() not null).
--    - the caller's auth account must be FRESH — created within
--      the last 10 minutes. Linking Google to an older account
--      keeps the role it already has.
--    - the caller's profile row must exist, and the role may only
--      move creator -> brand (or stay what it already is —
--      idempotent). A role already set to something else is
--      refused.
--    - the caller must have ZERO campaigns and ZERO submissions:
--      a fresh account has no activity yet, so any row means the
--      account is already in use.
--    - only the caller's own row is ever touched.
-- 2) The migration 0010 privilege guard (prevent_privilege_
--    escalation) would block even this function's UPDATE, because
--    auth.uid() is still the non-owner caller inside a SECURITY
--    DEFINER function. So the function sets a transaction-local
--    flag (app.oauth_role_claim = '1') around its own UPDATE, and
--    the guard honours it ONLY for the caller's own row and ONLY
--    when is_admin / is_blocked are untouched. PostgREST callers
--    cannot run SET, so no client can raise this flag itself;
--    SET LOCAL also dies with the transaction, so it can never
--    leak into a later request.
--
-- The code change that goes with this migration: the auth callback
-- calls claim_oauth_role via RPC instead of the updateUser metadata
-- write, and /brands + /dashboard read public.users.role only —
-- auth metadata is user-writable and never decides a role again.
-- If this migration has NOT been applied yet, the RPC call fails
-- cleanly (error, no throw) and a Google brand signup simply lands
-- on the creator dashboard — apply the migration first, then
-- deploy the code.
--
-- Run once in the Supabase SQL Editor. Idempotent / safe to
-- re-run: create or replace function + drop policy if exists.

-- 1) Privilege guard: honour the OAuth role-claim flag (see above).
--    Same body as migration 0010, plus the narrow exemption.
create or replace function public.prevent_privilege_escalation()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if (new.is_admin is distinct from old.is_admin)
     or (new.is_blocked is distinct from old.is_blocked)
     or (new.role is distinct from old.role) then
    -- OAuth role claim (migration 0034): claim_oauth_role() sets
    -- app.oauth_role_claim = '1' for its own transaction only,
    -- and only it can raise the flag (PostgREST callers cannot run
    -- SET). It may change ONLY the caller's own role — never
    -- is_admin / is_blocked.
    if current_setting('app.oauth_role_claim', true) = '1'
       and old.id = auth.uid()
       and new.is_admin is not distinct from old.is_admin
       and new.is_blocked is not distinct from old.is_blocked then
      return new;
    end if;
    if not public.is_admin() then
      raise exception 'Only the owner can change admin, blocked or role status.';
    end if;
  end if;
  return new;
end; $$;

-- 2) The one-time role claim for a fresh OAuth signup.
create or replace function public.claim_oauth_role(p_role text)
returns text language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid;
  v_created_at timestamptz;
  v_current_role text;
begin
  if p_role is null or p_role not in ('creator', 'brand') then
    raise exception 'Role must be creator or brand.';
  end if;

  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;

  -- Fresh account only: created within the last 10 minutes.
  select created_at into v_created_at from auth.users where id = v_uid;
  if v_created_at is null then
    raise exception 'Account not found.';
  end if;
  if v_created_at < now() - interval '10 minutes' then
    raise exception 'Role can only be claimed right after signup.';
  end if;

  -- Profile row must exist (handle_new_user creates it on signup).
  select role into v_current_role from public.users where id = v_uid;
  if v_current_role is null then
    raise exception 'Profile not found.';
  end if;

  -- Already the requested role: idempotent success.
  if v_current_role = p_role then
    return v_current_role;
  end if;

  -- Only the default 'creator' may be claimed up to 'brand'.
  -- Anything else (e.g. brand -> creator) is refused.
  if v_current_role <> 'creator' or p_role <> 'brand' then
    raise exception 'Role is already set.';
  end if;

  -- A fresh account has no activity yet.
  if exists (select 1 from public.campaigns where user_id = v_uid) then
    raise exception 'Account already has campaigns.';
  end if;
  if exists (select 1 from public.submissions where user_id = v_uid) then
    raise exception 'Account already has submissions.';
  end if;

  -- Raise the guard flag for this transaction only, update the
  -- caller's own row, then lower the flag again.
  perform set_config('app.oauth_role_claim', '1', true);
  update public.users set role = p_role where id = v_uid;
  perform set_config('app.oauth_role_claim', '', true);
  return p_role;
end; $$;

-- Only signed-in users may call it (the function itself re-checks
-- auth.uid()); anonymous callers cannot reach it at all.
revoke execute on function public.claim_oauth_role(text) from public;
grant execute on function public.claim_oauth_role(text) to authenticated;
