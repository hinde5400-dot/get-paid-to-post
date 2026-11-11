-- GET PAID TO POST — Instagram handle matched at submit time (0039)
--
-- ROUND 3 AUDIT P2-17: the Instagram ownership gate compared the
-- handle in the Reel URL with the creator's linked profile and then
-- discarded the result — the admin hand-check compared the Reel
-- against the creator's CURRENT users.instagram_url, so a creator
-- who edited their onboarding link after submitting was checked
-- against the wrong profile. Store the handle that actually
-- matched at submit time on the submission row, so the admin
-- checks against the profile the Reel came from.
--
-- ROUND 3 AUDIT P1-9 (same migration): the payment page shows the
-- brand a "budget changed" banner from campaign_budget_history,
-- but that table was owner-only (migration 0033) — a brand could
-- never read its own campaign's history, so the banner could only
-- ever appear for the admin. A brand may now read the history
-- rows of its OWN campaigns only (same exists() pattern as the
-- brand_messages brand-select policy, migration 0015). Brands
-- still cannot write history, and cannot read other brands' rows.
--
-- Run once in the Supabase SQL Editor. Idempotent / safe to
-- re-run: add column if not exists + drop policy if exists.

alter table public.submissions
  add column if not exists instagram_handle_matched text;

drop policy if exists "campaign_budget_history brand select own campaign"
  on public.campaign_budget_history;
create policy "campaign_budget_history brand select own campaign"
  on public.campaign_budget_history
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_budget_history.campaign_id
        and c.user_id = auth.uid()
    )
  );
