-- GET PAID TO POST — auto-expire unpaid pending campaigns (0030)
--
-- Item 13 (2026-11-10, Turn's decision): a campaign that stays
-- PENDING with NO payment for 7 days is junk — it must auto-expire
-- so Turn's pending list does not fill with time-wasters. Turn was
-- frustrated that anyone can submit a pending campaign without
-- paying, wasting his time.
--
-- THE RULE (exact): status = 'pending'
--   AND (payment_tx_id IS NULL OR payment_tx_id = '')
--   AND created_at < now() - interval '7 days'.
--
-- Only payment_tx_id counts as payment. Chat messages alone do NOT
-- count — a brand can write "I paid" or upload a screenshot in the
-- brand chat without ever entering a Transaction ID, and that is
-- not payment. This job never looks at brand_messages to decide
-- anything (it only deletes the messages along with the campaign).
--
-- HOW IT RUNS: same daily job as the ended-campaign cleanup
-- (migration 0023) — the GitHub Actions workflow
-- (.github/workflows/cleanup-ended-campaigns.yml) calls
-- /api/cron/cleanup-ended-campaigns once a day with CRON_SECRET,
-- and the route now calls the functions below alongside the
-- existing cleanup. No workflow change is needed. No service_role
-- key is used anywhere; all database access goes through the
-- SECURITY DEFINER functions below, following the 0023 pattern.
--
-- SAFETY: a pending campaign has no submissions (creators can only
-- submit to live campaigns) and no payouts, so deleting it loses
-- no creator money and no participant history. The delete function
-- still removes submissions defensively (counted, expected 0) and
-- deletes brand_messages explicitly so the count is exact — both
-- tables also reference campaigns ON DELETE CASCADE (migrations
-- 0001/0014), so anything missed still goes with the campaign row.
-- Wallets and withdrawals are NEVER touched. Proof images in the
-- private 'brand-proofs' bucket live at <campaign_id>/<uuid>.<ext>
-- (migration 0015) and are removed through the Storage API by the
-- route BEFORE the database delete, gated by the storage policy
-- below — same storage-first order as 0023, so no orphaned bytes
-- are left in S3.
--
-- NOTE: Turn's own test campaign "Music mitnt" is pending with no
-- payment_tx_id — it WILL expire under this rule on the first daily
-- run after it is 7 days old, unless he rejects it first. That is
-- fine and expected; do NOT delete it manually.
--
-- Run once in the Supabase SQL Editor. Idempotent / safe to
-- re-run: create or replace + drop policy if exists.

-- (a) The predicate. One function, used by the list function, the
--     delete function AND the storage delete policy, so they can
--     never drift apart.
create or replace function public.campaign_expired_unpaid_pending(
  p_campaign_id uuid
)
returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_campaign public.campaigns%rowtype;
begin
  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id;
  if not found then return false; end if;

  -- Still pending, never paid (no Transaction ID at all — chat
  -- messages and screenshots do not count), and 7+ days old.
  if v_campaign.status <> 'pending' then return false; end if;
  if v_campaign.payment_tx_id is not null
     and v_campaign.payment_tx_id <> '' then
    return false;
  end if;
  if v_campaign.created_at >= now() - interval '7 days' then
    return false;
  end if;

  return true;
end; $$;

grant execute on function public.campaign_expired_unpaid_pending(uuid)
  to anon, authenticated;

-- (b) Candidates: every pending, unpaid, 7+ day old campaign, with
--     its proof-image paths so the route can remove them through
--     the Storage API before the database delete.
create or replace function public.list_expired_pending_campaigns()
returns table (
  campaign_id uuid,
  title text,
  created_at timestamptz,
  messages_count bigint,
  storage_paths text[]
)
language sql security definer
set search_path = public as $$
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
    ) as storage_paths
  from public.campaigns c
  left join public.brand_messages m on m.campaign_id = c.id
  where c.status = 'pending'
    and (c.payment_tx_id is null or c.payment_tx_id = '')
    and c.created_at < now() - interval '7 days'
  group by c.id, c.title, c.created_at
  order by c.created_at asc;
$$;

grant execute on function public.list_expired_pending_campaigns()
  to anon, authenticated;

-- (c) Delete one expired pending campaign — re-checks the predicate
--     inside the same transaction, so a campaign that got paid (or
--     was approved/rejected) after the list step is never deleted.
--     Deletes brand_messages and submissions explicitly (so the
--     counts are exact); both also reference campaigns ON DELETE
--     CASCADE (migrations 0001/0014). Wallets and withdrawals are
--     NEVER touched. Storage objects are NOT deleted here (SQL
--     deletes would orphan the S3 bytes — see header); the route
--     removes them through the Storage API BEFORE calling this
--     function.
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

grant execute on function public.cleanup_expired_pending_campaign(uuid)
  to anon, authenticated;

-- (d) Storage delete policy for the expired-pending step. The cron
--     route has no user session, so it cannot use the owner-only
--     policies — and a plain SQL delete of storage.objects would
--     orphan the file bytes in S3 (see header). This policy lets
--     the Storage API remove() call delete an object ONLY when its
--     campaign passes the exact same expiry predicate as the
--     database cleanup, so proofs of live, recently-created, or
--     paid pending campaigns can never be removed through it. The
--     CASE + regex guard keeps a non-UUID folder name from ever
--     reaching the uuid cast.
drop policy if exists "brand-proofs cleanup delete expired pending"
  on storage.objects;
create policy "brand-proofs cleanup delete expired pending"
  on storage.objects
  for delete using (
    bucket_id = 'brand-proofs'
    and case
      when (storage.foldername(name))[1] ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.campaign_expired_unpaid_pending(
        (storage.foldername(name))[1]::uuid
      )
      else false
    end
  );
