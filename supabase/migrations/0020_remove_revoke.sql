-- GET PAID TO POST — remove the revoke system (0020)
--
-- P0 batch 1 (2026-11-09, Turn's decision): there is no revoke any
-- more. Submissions have only three statuses — Pending → Approved /
-- Rejected — and a rejection after approval fully reverses the
-- earnings instead of revoking the submission.
--
-- (a) Tighten the submission-insert RLS check from migration 0010:
--     inserts may ONLY be status 'pending' now (previously
--     'pending'/'revoked'). The zero earnings/views/likes rule is
--     unchanged. Migration 0010 itself is NOT edited — this policy
--     replaces it, the same DROP/CREATE style the repo uses.
-- (b) Add rejection_reason so every rejection can record WHY it was
--     rejected (bot views, brief mismatch, wrong content, duplicate).
--
-- No data migration: the live database has ZERO submissions.
-- Run once in the Supabase SQL Editor.

-- (b) Rejection reason column.
alter table public.submissions
  add column if not exists rejection_reason text;

-- (a) Submission inserts: pending only, zero numbers.
drop policy if exists "submissions own insert" on public.submissions;
create policy "submissions own insert" on public.submissions
  for insert with check (
    auth.uid() = user_id
    and status = 'pending'
    and earnings = 0
    and views = 0
    and likes = 0
  );
