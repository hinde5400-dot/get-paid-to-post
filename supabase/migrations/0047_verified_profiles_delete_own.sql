-- GET PAID TO POST — bio-code disconnect (0047)
--
-- The Connect page lets a creator Disconnect their own verified
-- profile (DELETE /api/profile/verify), freeing the slot so they
-- can connect a different profile on that platform. Migration
-- 0046 gave users select/insert/update on their own rows and
-- delete to the admin only — without an own-delete policy RLS
-- refuses the Disconnect. This adds it. Nothing else changes:
-- no screenshot/manual path, no admin approval anywhere.
create policy "verified_profiles delete own" on public.verified_profiles
  for delete using (user_id = auth.uid());
