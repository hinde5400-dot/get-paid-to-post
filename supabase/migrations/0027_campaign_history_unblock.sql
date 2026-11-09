-- GET PAID TO POST — participant history + unblock support (0027)
--
-- 2026-11-10, Turn's decisions:
-- (a) Participant history surviving auto-delete: when an ended
--     campaign is auto-deleted, each creator who joined it keeps a
--     record — one row per creator in campaign_history. Only the
--     creator who joined sees their own rows (RLS: SELECT only
--     where auth.uid() = user_id); a creator who never joined the
--     campaign sees nothing, and nothing is ever shown on Discover.
--     campaign_id is kept as a plain value, NOT a foreign key —
--     the campaign row is deleted, so a FK would break. Wallets
--     and withdrawals are still NEVER deleted (unchanged).
-- (b) Unblock support: creator_flags gains unblocked_at. The fraud
--     ladder (src/lib/fraud.ts) counts only bot rejections AFTER
--     unblocked_at, so an unblocked creator gets a fresh start;
--     rejections before the unblock stay visible as history but no
--     longer count toward a re-ban.
-- (c) cleanup_ended_campaign() (migration 0023) is updated via
--     CREATE OR REPLACE with the SAME signature and return type —
--     body-only change, so no 42P13 error. It now inserts the
--     history rows FIRST, in the same transaction, BEFORE deleting
--     brand_messages / submissions / campaigns.
--
-- Run once in the Supabase SQL Editor.

-- (a) Participant history table.
create table if not exists public.campaign_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete cascade,
  campaign_id uuid,
  campaign_title text,
  brand_name text,
  platforms text[],
  joined_at timestamptz,
  clips_submitted integer not null default 0,
  clips_approved integer not null default 0,
  total_views bigint not null default 0,
  total_earned numeric not null default 0,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create index if not exists campaign_history_user_id_idx
  on public.campaign_history (user_id);

alter table public.campaign_history enable row level security;

-- Creators read ONLY their own history rows. There is deliberately
-- NO insert/update/delete policy for users: only the SECURITY
-- DEFINER cleanup function below writes to this table.
create policy "users read own campaign_history" on public.campaign_history
  for select using (auth.uid() = user_id);

-- (b) Unblock timestamp for the fraud ladder reset.
alter table public.creator_flags
  add column if not exists unblocked_at timestamptz;

-- (c) Cleanup now saves participant history before deleting.
--     Same signature and return type as migration 0023 — only the
--     body changes (history insert first, same transaction).
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
  if not public.campaign_eligible_for_cleanup(p_campaign_id) then
    return query
      select false, 'not eligible for cleanup'::text, 0, 0;
    return;
  end if;

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id;

  -- Participant history (see header): one row per creator who
  -- submitted to this campaign, saved BEFORE anything is deleted.
  -- Only that creator can ever read their row (RLS above).
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

grant execute on function public.cleanup_ended_campaign(uuid)
  to anon, authenticated;
