-- GET PAID TO POST — 30-minute submit rule + per-submission flags (0031)
--
-- ADMIN BATCH 2 (2026-11-10, Turn's decisions):
--
-- (a) 30-MINUTE SUBMIT RULE (matches Content Rewards exactly): a
--     creator must submit the post link within 30 minutes of posting
--     the video; a link posted more than 30 minutes earlier is not
--     accepted. The video's posted time is fetched from the platform
--     API at submit time and stored in submissions.posted_at.
--     posted_time_unverified = true when the API could not supply a
--     posted time (e.g. Instagram has no API access yet) — the admin
--     then checks the post time by hand on the review card.
--
-- (b) FLAG ACTION (Content Rewards model): flagging a submission
--     PAUSES its payout — it is NOT a rejection and reverses
--     nothing. A flagged submission stays status 'pending' (or
--     'approved' with its earnings still in hold) until a human
--     decides: Approve, Reject (full reversal as today) or Unflag.
--     One appeal per flag via Discord (process, not a column).
--     Flag state lives in submission_flags so the submissions.status
--     values stay exactly Pending / Approved / Rejected — the
--     cleanup / auto-delete predicates (migrations 0023/0030) keep
--     working unchanged. An active flag is a row with
--     resolved_at IS NULL; resolving stamps resolved_at +
--     resolved_action ('approved' | 'rejected' | 'unflagged').
--
-- (c) A flagged APPROVED submission's payout really stays paused:
--     release_matured_holds() (migration 0011) now skips approved
--     submissions with an active flag, so the 72h hold cannot
--     release while flagged. Once unflagged, the next lazy wallet
--     read releases it as normal. The function signature and return
--     type are unchanged, so CREATE OR REPLACE is safe here.
--
-- Run once in the Supabase SQL Editor. Idempotent / safe to
-- re-run: add column if not exists + create table if not exists.

alter table public.submissions
  add column if not exists posted_at timestamptz,
  add column if not exists posted_time_unverified boolean not null default false;

create table if not exists public.submission_flags (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  flagged_by uuid references public.users (id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_action text
);

create index if not exists idx_submission_flags_submission
  on public.submission_flags (submission_id, created_at desc);

alter table public.submission_flags enable row level security;

-- Owner-only: flags live on /admin, which is owner-only.
-- Creators never see flags (no select policy for them).
create policy "admins read submission_flags" on public.submission_flags
  for select using (public.is_admin());
create policy "admins write submission_flags" on public.submission_flags
  for all using (public.is_admin());

-- (c) Hold release skips flagged payouts.
create or replace function public.release_matured_holds()
returns integer language plpgsql security definer
set search_path = public as $$
declare
  r record;
  released int := 0;
begin
  -- FOR UPDATE locks each row so two concurrent calls cannot
  -- release the same submission twice.
  for r in
    select id, user_id, earnings
    from public.submissions
    where status = 'approved'
      and earnings > 0
      and hold_until is not null
      and hold_until <= now()
      and hold_released_at is null
      -- A flagged payout stays paused until a human unflags it
      -- (migration 0031): the hold cannot release while an
      -- unresolved flag exists for this submission.
      and not exists (
        select 1 from public.submission_flags f
        where f.submission_id = submissions.id
          and f.resolved_at is null
      )
    for update
  loop
    update public.wallets
      set available_balance = available_balance + r.earnings,
          pending_balance = greatest(0, pending_balance - r.earnings),
          updated_at = now()
      where user_id = r.user_id;
    if found then
      update public.submissions
        set hold_released_at = now()
        where id = r.id;
      released := released + 1;
    end if;
  end loop;
  return released;
end; $$;

grant execute on function public.release_matured_holds() to anon, authenticated;
