-- GET PAID TO POST — TikTok disconnect (0017)
--
-- Lets a signed-in creator delete ONLY their own rows in
-- public.tiktok_connections, so the Disconnect TikTok button on
-- /connect (DELETE /api/auth/tiktok) can unlink their account.
-- A creator can reconnect anytime. No other table is touched.

create policy "tiktok_connections delete own" on public.tiktok_connections
  for delete using (user_id = auth.uid());
