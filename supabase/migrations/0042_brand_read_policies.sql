-- GET PAID TO POST — brand read policies (0042)
--
-- Two gaps the brand workstream's code hit (no application-code
-- change here — the loaders and the mark-read call already exist):
--
-- 1) P1-B3: a brand could not READ the submissions on its own
--    campaigns — the only submissions SELECT policies were the
--    creator's own rows (0001 "submissions own read") and the
--    owner's all-rows policy (0002 "admins read all submissions").
--    The brand per-clip list in the campaign Apps tab therefore
--    came back empty. This adds a SELECT policy letting a brand
--    read submissions for campaigns it owns (campaigns.user_id =
--    auth.uid()), mirroring the EXISTS-on-campaigns pattern from
--    0015 ("brand_messages brand select own campaign"). Creators
--    still see only their own clips; other brands see nothing.
-- 2) P2-B6: a brand could not mark its own thread read — the only
--    brand_messages UPDATE policy was the owner's, so the
--    brand-side mark-read call (PATCH /api/campaigns/[id]/messages,
--    is_read = true) was refused by RLS and the "New reply from
--    admin" badge never cleared. This adds an UPDATE policy
--    letting a brand update rows in its own campaigns' threads.
--
--    This policy is safe because the is_read-only guard from 0014
--    (enforce_brand_message_update trigger) still applies to EVERY
--    update on brand_messages, whoever makes it: only is_read may
--    differ from the old row, so a brand can mark messages read
--    and nothing else — message text, sender, proof and campaign
--    can never be rewritten through this policy. (0014's comment
--    that "brands have no update policy at all" is superseded by
--    this migration; the trigger itself is unchanged.)
--
-- No DELETE policy is added for either table. Safe to run after
-- the code deploy; the app reads both tables as optional with
-- fallbacks. Never applied live from here — Turn applies
-- migrations in Supabase.
-- Never put the service_role key in the website code.

-- 1) Brand reads submissions of its OWN campaigns only.
drop policy if exists "submissions brand read own campaign" on public.submissions;
create policy "submissions brand read own campaign" on public.submissions
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = submissions.campaign_id
        and c.user_id = auth.uid()
    )
  );

-- 2) Brand marks messages read in its OWN campaigns' threads only.
--    The 0014 trigger caps the change to is_read (see header).
drop policy if exists "brand_messages brand update own campaign" on public.brand_messages;
create policy "brand_messages brand update own campaign" on public.brand_messages
  for update using (
    exists (
      select 1 from public.campaigns c
      where c.id = brand_messages.campaign_id
        and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.campaigns c
      where c.id = brand_messages.campaign_id
        and c.user_id = auth.uid()
    )
  );
