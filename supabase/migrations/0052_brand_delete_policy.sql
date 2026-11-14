-- GET PAID TO POST — brand delete permission (0052)
--
-- Root cause of the broken brand Delete button (2026-11-14): the
-- DELETE /api/brand/campaigns/[id] route runs with the brand's own
-- session, but no DELETE policy ever existed on public.campaigns —
-- so the delete matched 0 rows and silently did nothing while the
-- route still returned { ok: true }. A brand could never delete
-- its own pending campaign.
--
-- This policy lets a brand delete ONLY its own campaign, ONLY while
-- it is still pending AND unpaid (payment_tx_id empty) — exactly the
-- same guards the API route enforces. Live campaigns, paid
-- campaigns and anyone else's campaigns can never be deleted
-- through it. The route now also verifies a row was actually
-- deleted (see src/app/api/brand/campaigns/[id]/route.ts), so a
-- silent 0-row delete can never report success again.

create policy "campaigns delete own pending" on public.campaigns
  for delete
  using (
    auth.uid() = user_id
    and status = 'pending'
    and (payment_tx_id is null or payment_tx_id = '')
  );
