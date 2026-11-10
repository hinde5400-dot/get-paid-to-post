-- GET PAID TO POST — public bucket for campaign images (0032)
--
-- Brand Logo + Thumbnail uploads (Turn's decision 2026-11-10):
-- on the /brands campaign form, Brand Logo and Thumbnail are BOTH
-- REQUIRED file uploads with an upload button — NOT optional link
-- fields any more. The campaign-create API (src/app/api/campaigns)
-- now rejects a campaign whose logo/thumbnail is not an uploaded
-- image in this bucket.
--
-- WHY A NEW BUCKET: logos/thumbnails are uploaded BEFORE the
-- campaign exists (no campaign id yet), so they cannot live in the
-- private 'brand-proofs' bucket, whose objects are scoped to
-- <campaign_id>/ folders and are private. Logos and thumbnails are
-- shown to everyone on Discover cards, so this bucket is PUBLIC
-- and objects live at <user_id>/<uuid>.<ext> under the uploading
-- brand's own folder. getPublicUrl() returns a URL the app stores
-- in campaigns.logo_url / thumbnail_url and renders directly —
-- CampaignBanner already renders both (logo tile + thumbnail
-- banner photo), so no display change is needed. No new columns:
-- logo_url (migration 0004) and thumbnail_url (migration 0009)
-- already exist.
--
-- STORAGE HYGIENE (Supabase free tier is 1 GB, shared with brand
-- proofs): when a campaign auto-deletes, its logo and thumbnail
-- are deleted too. The list functions below now also return the
-- campaign's image paths (parsed out of logo_url/thumbnail_url),
-- and the cleanup cron route removes them through the Storage API
-- before the database delete — the same storage-first order as
-- migrations 0023/0030. The delete policies let the Storage API
-- remove() call delete an object ONLY when its campaign passes
-- the exact same eligibility/expiry predicate as the database
-- cleanup, via the SECURITY DEFINER helpers (the cron route has
-- no user session, so the check must bypass RLS — the helpers
-- read campaigns directly, so a pending campaign's images can
-- never be deleted through the policy even though anon cannot see
-- pending rows). Uploads that never became a campaign (brand
-- uploaded, then the campaign POST failed) are orphans: the
-- orphan helper + policy let the daily cleanup sweep delete them
-- once they are 1+ day old and referenced by no campaign.
--
-- Run once in the Supabase SQL Editor. Idempotent / safe to
-- re-run: bucket insert on conflict do nothing, drop policy if
-- exists, drop function if exists before re-creating the list
-- functions (their return type gains image_paths — Postgres
-- CREATE OR REPLACE cannot change a return type, so DROP first,
-- the same fix as migration 0022).

-- (a) Public bucket for campaign logos + thumbnails.
insert into storage.buckets (id, name, public)
values ('campaign-images', 'campaign-images', true)
on conflict (id) do nothing;

-- (b) Upload: a signed-in brand uploads only under its own user
--     folder (<user_id>/<uuid>.<ext>). The upload API route
--     (src/app/api/campaigns/upload-image) validates type
--     (PNG/JPG/WebP) and size (2 MB) before this policy is ever
--     reached.
drop policy if exists "campaign-images brand upload own folder"
  on storage.objects;
create policy "campaign-images brand upload own folder"
  on storage.objects
  for insert with check (
    bucket_id = 'campaign-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read: logos/thumbnails are shown to everyone on Discover
-- cards. Public URLs work without this, but the daily cleanup's
-- orphan sweep lists the bucket through the Storage API, which
-- needs a select policy.
drop policy if exists "campaign-images public read"
  on storage.objects;
create policy "campaign-images public read"
  on storage.objects
  for select using (bucket_id = 'campaign-images');

-- (c) SECURITY DEFINER helpers for the delete policies. They read
--     public.campaigns directly (bypassing RLS), so they work for
--     the cron route's anon client and for pending campaigns.
create or replace function public.campaign_image_cleanup_allowed(
  p_path text
)
returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_id uuid;
begin
  -- The object is this campaign's logo or thumbnail: the stored
  -- URL ends with /campaign-images/<path>. position() is a
  -- literal substring match (no LIKE wildcards in the path).
  select id into v_id
  from public.campaigns
  where position('/campaign-images/' || p_path in coalesce(logo_url, '')) > 0
     or position('/campaign-images/' || p_path in coalesce(thumbnail_url, '')) > 0
  limit 1;
  if v_id is null then return false; end if;
  return public.campaign_eligible_for_cleanup(v_id)
      or public.campaign_expired_unpaid_pending(v_id);
end; $$;

grant execute on function public.campaign_image_cleanup_allowed(text)
  to anon, authenticated;

create or replace function public.campaign_image_is_orphan(
  p_path text
)
returns boolean
language plpgsql security definer
set search_path = public as $$
declare
  v_created timestamptz;
  v_ref bigint;
begin
  select created_at into v_created
  from storage.objects
  where bucket_id = 'campaign-images' and name = p_path;
  if not found then return false; end if;
  -- Fresh uploads get a full day: a brand may still be finishing
  -- its campaign submit, so only 1+ day old objects are orphans.
  if v_created > now() - interval '1 day' then return false; end if;
  select count(*) into v_ref
  from public.campaigns
  where position('/campaign-images/' || p_path in coalesce(logo_url, '')) > 0
     or position('/campaign-images/' || p_path in coalesce(thumbnail_url, '')) > 0;
  return v_ref = 0;
end; $$;

grant execute on function public.campaign_image_is_orphan(text)
  to anon, authenticated;

-- (d) Delete policies: an object may be removed through the
--     Storage API only when its campaign is being auto-deleted, or
--     when it is an unreferenced orphan. Referenced images of
--     live, pending, or recently-ended campaigns can never be
--     deleted through either policy.
drop policy if exists "campaign-images cleanup delete"
  on storage.objects;
create policy "campaign-images cleanup delete"
  on storage.objects
  for delete using (
    bucket_id = 'campaign-images'
    and public.campaign_image_cleanup_allowed(name)
  );

drop policy if exists "campaign-images orphan delete"
  on storage.objects;
create policy "campaign-images orphan delete"
  on storage.objects
  for delete using (
    bucket_id = 'campaign-images'
    and public.campaign_image_is_orphan(name)
  );

-- (e) list_cleanup_candidates() gains image_paths: the campaign's
--     logo/thumbnail object paths, parsed out of the stored URLs.
--     DROP first — the return type changes (see header).
drop function if exists public.list_cleanup_candidates();
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
$$;

grant execute on function public.list_cleanup_candidates()
  to anon, authenticated;

-- (f) list_expired_pending_campaigns() gains image_paths too, so
--     an expired unpaid pending campaign's logo/thumbnail are
--     removed with it. DROP first — same return-type reason.
drop function if exists public.list_expired_pending_campaigns();
create or replace function public.list_expired_pending_campaigns()
returns table (
  campaign_id uuid,
  title text,
  created_at timestamptz,
  messages_count bigint,
  storage_paths text[],
  image_paths text[]
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
$$;

grant execute on function public.list_expired_pending_campaigns()
  to anon, authenticated;
