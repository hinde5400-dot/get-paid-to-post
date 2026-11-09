-- GET PAID TO POST — auto-delete ended campaigns (0023)
--
-- P0 batch 4 (2026-11-09, Turn's decision): an ended campaign is
-- AUTO-DELETED one day after payout is complete — the campaign row,
-- its submissions, its brand chat (brand_messages) and its proof
-- images in the 'brand-proofs' bucket. This SUPERSEDES the old
-- "proofs stay forever / no deletion" rule (audit §3.9/§4): with
-- auto-delete, the bucket only ever holds live campaigns' proofs
-- plus ~1 week of ended-campaign leftovers.
--
-- HOW IT RUNS (no service_role key anywhere, same pattern as the
-- view refresh in 0018): a GitHub Actions workflow
-- (.github/workflows/cleanup-ended-campaigns.yml) calls
-- /api/cron/cleanup-ended-campaigns once a day with CRON_SECRET.
-- The route has no user session, so all database access goes
-- through the SECURITY DEFINER functions below. The route deletes
-- storage objects through the Storage API (see the policy at the
-- end) and only then deletes the database rows.
--
-- SAFETY PREDICATE — a campaign is deleted ONLY when ALL hold
-- (campaign_eligible_for_cleanup is the single source of truth,
-- used by the list function, the delete function AND the storage
-- delete policy, so they can never drift apart):
--   (a) it ENDED: status is 'live' and it is funded, but it is no
--       longer live by the site's own definition (isCampaignLive in
--       src/lib/data.ts) — budget_left <= 0 OR ends_at has passed.
--       A campaign that never went live (status 'pending'/'draft',
--       or never funded) is NEVER a candidate.
--   (b) NO submissions with status 'pending' remain.
--   (c) NO approved submission has an unknown hold (hold_until
--       null) — an approval whose hold cannot be verified blocks
--       deletion instead of failing it.
--   (d) PAYOUT IS COMPLETE — conservative operational definition
--       (see the judgment call below): every approved submission's
--       72h hold has matured AND at least 1 day has passed since
--       the LATEST hold_until among the campaign's approved
--       submissions. Money itself is never at risk from this job:
--       wallets and withdrawals are NEVER deleted, and matured
--       holds sit in the creator's available balance whether or
--       not they have withdrawn yet.
--   (e) SETTLEMENT TIMELINE: no deletion earlier than 7 days after
--       the campaign ended (3-day re-check window for suspicious
--       videos + 3-day/72h hold + 1-day buffer). The end time is
--       the earlier of ends_at and the last submission's
--       created_at — budget exhaustion has no timestamp of its
--       own, so last submission activity is the proxy — falling
--       back to the campaign's created_at.
--
-- JUDGMENT CALL — "payout complete" cannot be verified exactly:
-- withdrawals are NOT linked to campaigns in the schema
-- (withdrawals.user_id only, migration 0002) and wallet balances
-- are per-user, not per-campaign, so "all of THIS campaign's
-- earnings have been withdrawn" is unknowable from the data. The
-- definition in (d) above is the conservative operational stand-in:
-- once every hold has matured + 1 day, every cent the campaign
-- owes is in creators' available balances, and deleting the
-- campaign row cannot lose or strand any money (wallets and
-- withdrawal history stay forever). Confirm this definition with
-- Turn — if he wants deletion to wait until creators have actually
-- withdrawn, that needs a per-campaign payout link in the schema
-- first (not built here).
--
-- STORAGE — deleting rows from storage.objects with SQL only
-- removes the metadata; the file bytes stay orphaned in S3 and
-- keep counting against the free-tier quota. So proof images are
-- deleted ONLY through the Storage API
-- (supabase.storage.from('brand-proofs').remove([...])), which
-- removes metadata AND bytes together. The cron route has no user
-- session, so it cannot use the owner-only policies — the delete
-- policy below therefore grants DELETE on storage.objects to any
-- caller, BUT only for objects whose campaign passes the exact
-- same eligibility function. The blast radius is deliberately
-- bounded: anyone holding the public anon key could at most delete
-- proofs of a campaign that is already past every safety window
-- and about to be auto-deleted within a day anyway. Proofs of
-- live, pending, or recently-ended campaigns can never be deleted
-- through it. The SECURITY DEFINER delete function below does NOT
-- touch storage.objects for exactly this reason.
--
-- Run once in the Supabase SQL Editor.

-- (a) The safety predicate. One function, used everywhere.
create or replace function public.campaign_eligible_for_cleanup(
  p_campaign_id uuid
)
returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_campaign public.campaigns%rowtype;
  v_last_sub timestamptz;
  v_ended_at timestamptz;
  v_pending bigint;
  v_approved_null_hold bigint;
  v_latest_hold timestamptz;
begin
  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id;
  if not found then return false; end if;

  -- Only a campaign that actually ran: funded and status 'live'.
  -- Pending/draft/never-funded campaigns are never candidates.
  if not v_campaign.is_funded or v_campaign.status <> 'live' then
    return false;
  end if;

  -- Ended, by the site's own live definition (isCampaignLive in
  -- src/lib/data.ts, inverted): budget exhausted OR duration over.
  if not (v_campaign.budget_left <= 0
          or (v_campaign.ends_at is not null
              and v_campaign.ends_at <= now())) then
    return false;
  end if;

  -- No pending submissions left — a pending clip may still be
  -- approved and paid, so it blocks deletion outright.
  select count(*) into v_pending
  from public.submissions
  where campaign_id = p_campaign_id and status = 'pending';
  if v_pending > 0 then return false; end if;

  -- No approved submission with an unknown hold — an approval whose
  -- 72h hold cannot be verified blocks deletion (skip, not fail).
  select count(*) into v_approved_null_hold
  from public.submissions
  where campaign_id = p_campaign_id
    and status = 'approved'
    and hold_until is null;
  if v_approved_null_hold > 0 then return false; end if;

  -- Payout complete (operational definition, see header): every
  -- approved hold matured, and at least 1 day since the latest one.
  select max(hold_until) into v_latest_hold
  from public.submissions
  where campaign_id = p_campaign_id and status = 'approved';
  if v_latest_hold is not null
     and v_latest_hold > now() - interval '1 day' then
    return false;
  end if;

  -- Settlement timeline: nothing deleted earlier than 7 days after
  -- the campaign ended (3-day re-check + 3-day hold + 1-day buffer).
  -- End time = earlier of ends_at and last submission activity
  -- (budget exhaustion has no timestamp of its own), else creation.
  select max(created_at) into v_last_sub
  from public.submissions
  where campaign_id = p_campaign_id;
  v_ended_at := coalesce(
    nullif(
      least(
        coalesce(v_campaign.ends_at, 'infinity'::timestamptz),
        coalesce(v_last_sub, 'infinity'::timestamptz)
      ),
      'infinity'::timestamptz
    ),
    v_campaign.created_at
  );
  if v_ended_at > now() - interval '7 days' then return false; end if;

  return true;
end; $$;

grant execute on function public.campaign_eligible_for_cleanup(uuid)
  to anon, authenticated;

-- (b) Candidates: every funded live-status campaign that has ended,
--     with the diagnostics the route logs and the reason a campaign
--     is skipped. Eligible rows are the only ones the route acts on.
create or replace function public.list_cleanup_candidates()
returns table (
  campaign_id uuid,
  title text,
  ended_at timestamptz,
  pending_count bigint,
  approved_count bigint,
  latest_hold_until timestamptz,
  storage_paths text[],
  eligible boolean,
  skip_reason text
)
language sql security definer
set search_path = public as $$
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
        as latest_hold_until
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
$$;

grant execute on function public.list_cleanup_candidates()
  to anon, authenticated;

-- (c) Delete one campaign — re-checks eligibility inside the same
--     transaction, so a campaign that became ineligible after the
--     list step is never deleted. Deletes brand_messages and
--     submissions explicitly (so the counts are exact); both also
--     reference campaigns ON DELETE CASCADE (migrations 0001/0014),
--     so anything missed still goes with the campaign row. Wallets
--     and withdrawals are NEVER touched — money history stays
--     forever. Storage objects are NOT deleted here (SQL deletes
--     would orphan the S3 bytes — see header); the route removes
--     them through the Storage API BEFORE calling this function.
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
  v_subs integer := 0;
  v_msgs integer := 0;
begin
  if not public.campaign_eligible_for_cleanup(p_campaign_id) then
    return query
      select false, 'not eligible for cleanup'::text, 0, 0;
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

grant execute on function public.cleanup_ended_campaign(uuid)
  to anon, authenticated;

-- (d) Storage delete policy for the cleanup job. The cron route has
--     no user session, so it cannot use the owner-only policies
--     from migration 0015 — and a plain SQL delete of
--     storage.objects would orphan the file bytes in S3 (see
--     header). This policy lets the Storage API remove() call
--     delete an object ONLY when its campaign passes the exact same
--     eligibility function as the database cleanup, so proofs of
--     live, pending, or recently-ended campaigns can never be
--     removed through it. The CASE + regex guard keeps a
--     non-UUID folder name from ever reaching the uuid cast.
drop policy if exists "brand-proofs cleanup delete eligible"
  on storage.objects;
create policy "brand-proofs cleanup delete eligible"
  on storage.objects
  for delete using (
    bucket_id = 'brand-proofs'
    and case
      when (storage.foldername(name))[1] ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.campaign_eligible_for_cleanup(
        (storage.foldername(name))[1]::uuid
      )
      else false
    end
  );
