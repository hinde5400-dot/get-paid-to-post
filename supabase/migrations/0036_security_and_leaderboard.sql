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
--     UPDATE 2026-11-10 (guard follow-up, section (1b) below):
--     the cron follow-up above is BUILT — both cron routes now
--     sign in as a dedicated service account (cron-service.ts,
--     commits 59c1bdb + c9fac25) before any RPC call, and the
--     guards in (1b) accept exactly that account (JWT email
--     cron@get-paid-to-post.vercel.app) plus the owner. A signed-in
--     user who is neither gets a clear exception from the RPC
--     itself — the authenticated-only grant alone was not enough
--     (any free signup could still call the RPCs directly).
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
-- (1b) Internal caller guards (P0-3 follow-up).
-- ================================================================
--
-- Section (1) revoked anon, but granting to `authenticated` alone
-- does NOT close P0-3: ANY signed-in user (free signup) could
-- still call these RPCs directly with the anon key + their session
-- and forge views, read every creator's TikTok tokens, or delete
-- eligible campaigns. The grant is the outer gate; the guard
-- inside each function below is the real check. The guard allows
-- exactly two callers: the owner (is_admin()) and the dedicated
-- cron service account (JWT email cron@get-paid-to-post.vercel.app
-- — the account both cron routes sign in as, cron-service.ts).
-- Everyone else gets a clear exception naming the function.
-- Each redefinition below is byte-identical to its source
-- migration except for the guard as the first statement (and the
-- language sql -> plpgsql conversion for the read-only list
-- functions, which need a statement body to hold the guard —
-- same signature, same return type, same query).
--
-- ONE CONSTANT: if the service account is ever created with a
-- different email, change it in is_privileged_caller() below and
-- nowhere else. The cron routes read the same address from
-- CRON_SERVICE_EMAIL in Vercel — the two must match, or both cron
-- jobs fail with the guard exception (fail loud, never silent).
--
-- Deliberately NOT guarded here (read the reasoning — each one
-- would break a legitimate flow or adds nothing):
--   - campaign_eligible_for_cleanup / campaign_expired_unpaid_
--     pending / campaign_image_cleanup_allowed / campaign_image_
--     is_orphan: pure read-only boolean predicates. They mutate
--     nothing; the mutations that use them (cleanup_ended_campaign
--     etc.) are guarded below. All four are ALSO evaluated inside
--     storage delete policies (brand-proofs cleanup policies in
--     0023/0030, campaign-images policies in 0032), and those
--     policies are evaluated for brand users too — e.g. the brand
--     chat route deletes a failed proof upload through the
--     brand-proofs bucket as the brand (messages route), so a
--     guard inside a predicate would raise for a brand instead
--     of the policy evaluating. The policies themselves are the
--     enforcement point for storage deletes (eligible / expired /
--     orphan only — the bounded blast radius 0023 accepted).
--     campaign_image_is_orphan is BOTH a policy helper AND a
--     direct RPC (the cron orphan sweep) — its direct call returns
--     a boolean only; the delete after it stays policy-gated.
--   - release_matured_holds: NOT guarded — and the "bypasses the
--     72h hold" fear is wrong for this function. Its body (0011)
--     only releases holds with hold_until <= now() (already
--     matured), to the rightful owner, exactly once
--     (hold_released_at is null + FOR UPDATE lock). Calling it
--     early moves nothing. And it is called lazily by ANY signed-in
--     user — getWallet on every wallet read and the withdrawals
--     route — so an admin-or-cron guard would strand creators'
--     matured earnings in Pending until an admin happened to act.
--     The 72h hold is enforced by the time condition inside the
--     function, not by who calls it.
--   - get_public_leaderboard / get_total_paid_out: public
--     aggregates by design (section (4)), granted to anon.
--   - decrement_campaign_budget / set_campaign_budget_total:
--     already check is_admin() inside (section (5)) — verified.
--   - save_tiktok_tokens gets a THIRD allowed caller below: the
--     creator saving their OWN tokens (auth.uid() = p_user_id) —
--     the submit flow (submissions route, posted-time.ts) saves
--     refreshed tokens as the signed-in creator, while the refresh
--     job saves them as the cron account for OTHER users' ids, so
--     a plain admin-or-cron guard would break submits.

-- The single privilege check. Plain SQL function (no SECURITY
-- DEFINER needed — it only reads auth state); default grants,
-- like is_admin(): it reveals only whether the CALLER is
-- privileged, which is not sensitive. The lower() makes the email
-- comparison case-insensitive (Supabase lowercases signup emails,
-- but the Vercel env value is typed by hand).
create or replace function public.is_privileged_caller()
returns boolean
language sql stable
set search_path = public as $$
  select public.is_admin()
      or lower(coalesce(auth.jwt() ->> 'email', '')) = 'cron@get-paid-to-post.vercel.app';
$$;

-- View refresh (0018 / 0019 / 0022), guarded. Callers: lib/views/
-- refresh.ts only — the 3-hour cron (service account) and the
-- owner's manual refresh (admin). Bodies verbatim from their
-- source migrations.
create or replace function public.list_pending_submissions_for_refresh()
returns table (
  id uuid,
  user_id uuid,
  platform text,
  post_url text,
  views bigint,
  likes bigint,
  comments bigint,
  views_refreshed_at timestamptz
)
language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_privileged_caller() then
    raise exception 'list_pending_submissions_for_refresh: admin or cron service account only';
  end if;
  return query
  select s.id, s.user_id, s.platform, s.post_url, s.views,
         s.likes, s.comments, s.views_refreshed_at
  from public.submissions s
  where s.status = 'pending'
    and s.created_at > now() - interval '14 days'
  order by s.views_refreshed_at asc nulls first, s.created_at asc
  limit 200;
end; $$;

create or replace function public.apply_view_refresh(
  p_submission_id uuid,
  p_views bigint
)
returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_privileged_caller() then
    raise exception 'apply_view_refresh: admin or cron service account only';
  end if;
  update public.submissions
    set views = greatest(0, p_views),
        views_refreshed_at = now()
    where id = p_submission_id
      and status = 'pending';
  return found;
end; $$;

create or replace function public.apply_view_refresh(
  p_submission_id uuid,
  p_views bigint,
  p_likes bigint default 0,
  p_comments bigint default 0
)
returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_privileged_caller() then
    raise exception 'apply_view_refresh: admin or cron service account only';
  end if;
  update public.submissions
    set views = greatest(0, p_views),
        likes = greatest(0, p_likes),
        comments = greatest(0, p_comments),
        views_refreshed_at = now()
    where id = p_submission_id
      and status = 'pending';
  return found;
end; $$;

create or replace function public.list_tiktok_tokens_for_refresh()
returns table (
  user_id uuid,
  open_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz
)
language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_privileged_caller() then
    raise exception 'list_tiktok_tokens_for_refresh: admin or cron service account only';
  end if;
  return query
  select c.user_id, c.open_id, c.access_token, c.refresh_token,
         c.token_expires_at, c.refresh_expires_at
  from public.tiktok_connections c;
end; $$;

create or replace function public.save_tiktok_tokens(
  p_user_id uuid,
  p_open_id text,
  p_access_token text,
  p_refresh_token text,
  p_token_expires_at timestamptz,
  p_refresh_expires_at timestamptz
)
returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  -- Owner, cron service account, or the creator saving their OWN
  -- tokens (submit flow). The refresh job saves tokens for OTHER
  -- users' ids, so it passes via the service account, never via
  -- the self check. `is distinct from` (not <>) so a null
  -- auth.uid() can never silently pass the check.
  if not public.is_privileged_caller()
     and auth.uid() is distinct from p_user_id then
    raise exception 'save_tiktok_tokens: admin, cron service account, or own tokens only';
  end if;
  update public.tiktok_connections
    set access_token = p_access_token,
        refresh_token = p_refresh_token,
        token_expires_at = p_token_expires_at,
        refresh_expires_at = p_refresh_expires_at,
        updated_at = now()
    where user_id = p_user_id
      and open_id = p_open_id;
  return found;
end; $$;

create or replace function public.list_youtube_channels_for_refresh()
returns table (
  user_id uuid,
  channel_id text
)
language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_privileged_caller() then
    raise exception 'list_youtube_channels_for_refresh: admin or cron service account only';
  end if;
  return query
  select c.user_id, c.channel_id
  from public.youtube_connections c;
end; $$;

-- Cleanup (0023 / 0027 / 0030 / 0032), guarded. Callers: the
-- daily cleanup cron route only (service account). list_* bodies
-- are the 0032 versions (with image_paths); cleanup_ended_campaign
-- is the 0027 version (participant history first).
create or replace function public.list_cleanup_candidates()
returns table (
  campaign_id uuid,
  title text,
  ended_at timestamptz,
  pending_count bigint,
  approved_count bigint,
  latest_hold_until timestamptz,
  storage_paths text[],
  image_paths text[],
  eligible boolean,
  skip_reason text
)
language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_privileged_caller() then
    raise exception 'list_cleanup_candidates: admin or cron service account only';
  end if;
  return query
  with agg as (
    select
      c.id,
      c.title,
      c.created_at,
      coalesce(
        nullif(
          least(
            coalesce(c.ends_at, 'infinity'::timestamptz),
            coalesce(max(s.created_at), 'infinity'::timestamptz)
          ),
          'infinity'::timestamptz
        ),
        c.created_at
      ) as ended_at,
      count(s.id) filter (where s.status = 'pending') as pending_count,
      count(s.id) filter (where s.status = 'approved') as approved_count,
      count(s.id) filter (
        where s.status = 'approved' and s.hold_until is null
      ) as approved_null_hold,
      max(s.hold_until) filter (where s.status = 'approved')
        as latest_hold_until,
      max(substring(c.logo_url from '/campaign-images/(.+)$'))
        as logo_path,
      max(substring(c.thumbnail_url from '/campaign-images/(.+)$'))
        as thumbnail_path
    from public.campaigns c
    left join public.submissions s on s.campaign_id = c.id
    where c.is_funded
      and c.status = 'live'
      and (c.budget_left <= 0
           or (c.ends_at is not null and c.ends_at <= now()))
    group by c.id, c.title, c.created_at, c.ends_at
  )
  select
    a.id,
    a.title,
    a.ended_at,
    a.pending_count,
    a.approved_count,
    a.latest_hold_until,
    coalesce(
      (
        select array_agg(o.name order by o.name)
        from storage.objects o
        where o.bucket_id = 'brand-proofs'
          and o.name like a.id::text || '/%'
      ),
      '{}'::text[]
    ) as storage_paths,
    array_remove(
      array[a.logo_path, a.thumbnail_path],
      null
    ) as image_paths,
    public.campaign_eligible_for_cleanup(a.id) as eligible,
    case
      when a.pending_count > 0
        then 'pending submissions remain'
      when a.approved_null_hold > 0
        then 'approved submission with unknown hold_until'
      when a.latest_hold_until is not null
           and a.latest_hold_until > now() - interval '1 day'
        then 'latest payout hold matured less than 1 day ago'
      when a.ended_at > now() - interval '7 days'
        then 'ended less than 7 days ago (settlement timeline)'
      else null
    end as skip_reason
  from agg a
  order by a.ended_at asc;
end; $$;

create or replace function public.cleanup_ended_campaign(
  p_campaign_id uuid
)
returns table (
  deleted boolean,
  reason text,
  submissions_deleted integer,
  messages_deleted integer
)
language plpgsql security definer
set search_path = public as $$
declare
  v_campaign public.campaigns%rowtype;
  v_subs integer := 0;
  v_msgs integer := 0;
begin
  if not public.is_privileged_caller() then
    raise exception 'cleanup_ended_campaign: admin or cron service account only';
  end if;
  if not public.campaign_eligible_for_cleanup(p_campaign_id) then
    return query
      select false, 'not eligible for cleanup'::text, 0, 0;
    return;
  end if;

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id;

  -- Participant history (migration 0027): one row per creator who
  -- submitted to this campaign, saved BEFORE anything is deleted.
  -- Only that creator can ever read their row (RLS).
  insert into public.campaign_history
    (user_id, campaign_id, campaign_title, brand_name, platforms,
     joined_at, clips_submitted, clips_approved, total_views,
     total_earned, status)
  select
    s.user_id,
    p_campaign_id,
    v_campaign.title,
    v_campaign.brand_name,
    v_campaign.platforms,
    min(s.created_at),
    count(*)::int,
    (count(*) filter (where s.status = 'approved'))::int,
    coalesce(sum(s.views), 0),
    coalesce(sum(s.earnings), 0),
    'completed'
  from public.submissions s
  where s.campaign_id = p_campaign_id
  group by s.user_id;

  delete from public.brand_messages
  where campaign_id = p_campaign_id;
  get diagnostics v_msgs = row_count;

  delete from public.submissions
  where campaign_id = p_campaign_id;
  get diagnostics v_subs = row_count;

  delete from public.campaigns
  where id = p_campaign_id;
  if not found then
    return query
      select false, 'campaign already gone'::text, 0, 0;
    return;
  end if;

  return query select true, null::text, v_subs, v_msgs;
end; $$;

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
  where c.status = 'pending'
    and (c.payment_tx_id is null or c.payment_tx_id = '')
    and c.created_at < now() - interval '7 days'
  group by c.id, c.title, c.created_at
  order by c.created_at asc;
end; $$;

create or replace function public.cleanup_expired_pending_campaign(
  p_campaign_id uuid
)
returns table (
  deleted boolean,
  reason text,
  submissions_deleted integer,
  messages_deleted integer
)
language plpgsql security definer
set search_path = public as $$
declare
  v_subs integer := 0;
  v_msgs integer := 0;
begin
  if not public.is_privileged_caller() then
    raise exception 'cleanup_expired_pending_campaign: admin or cron service account only';
  end if;
  if not public.campaign_expired_unpaid_pending(p_campaign_id) then
    return query
      select false, 'not an expired unpaid pending campaign'::text, 0, 0;
    return;
  end if;

  delete from public.brand_messages
  where campaign_id = p_campaign_id;
  get diagnostics v_msgs = row_count;

  delete from public.submissions
  where campaign_id = p_campaign_id;
  get diagnostics v_subs = row_count;

  delete from public.campaigns
  where id = p_campaign_id;
  if not found then
    return query
      select false, 'campaign already gone'::text, 0, 0;
    return;
  end if;

  return query select true, null::text, v_subs, v_msgs;
end; $$;

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
