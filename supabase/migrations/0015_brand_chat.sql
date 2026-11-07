-- GET PAID TO POST — brand chat (0015)
--
-- Two-way private chat locked to one campaign: the campaign's brand
-- and the admin can talk here, and the brand uploads a payment proof
-- screenshot DIRECTLY (no Google Drive / Imgur links any more).
-- Proof stays attached to the campaign; the owner's personal email
-- is never involved. Brands can also reach the admin on Discord,
-- but this chat is where the proof lives.
--
-- 1) brand_messages gains sender ('brand' | 'admin'), message_type
--    ('text' | 'image') and image_path (object path in the private
--    'brand-proofs' Storage bucket). proof_url stays in the table
--    (unused) so old rows keep working — the app never writes or
--    reads it any more.
-- 2) RLS is rewritten for two-way chat: a brand reads ALL messages
--    (its own and the admin's replies) on campaigns it owns, and
--    inserts only its own messages on its own campaigns. The owner
--    reads everything, inserts replies as sender 'admin', and may
--    update ONLY is_read (enforced by the existing trigger).
--    No DELETE policy.
-- 3) Private Storage bucket 'brand-proofs': objects live under
--    <campaign_id>/<uuid>.<ext>. Brands may upload/select objects
--    under their own campaigns only; the owner may select all.
--    No public access, no delete.
--
-- The app reads the table as optional with fallbacks, so this
-- migration is safe to run after the code deploy.

alter table public.brand_messages
  add column if not exists sender text not null default 'brand',
  add column if not exists message_type text not null default 'text',
  add column if not exists image_path text null;

-- Idempotent check constraints (plain ADD CONSTRAINT is not
-- re-runnable, so guard with a DO block).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'brand_messages_sender_check'
  ) then
    alter table public.brand_messages
      add constraint brand_messages_sender_check
      check (sender in ('brand', 'admin'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'brand_messages_message_type_check'
  ) then
    alter table public.brand_messages
      add constraint brand_messages_message_type_check
      check (message_type in ('text', 'image'));
  end if;
end $$;

-- Drop the one-way (0014) policies and rewrite them for two-way chat.
drop policy if exists "brand_messages brand insert own" on public.brand_messages;
drop policy if exists "brand_messages brand select own" on public.brand_messages;
drop policy if exists "brand_messages owner select all" on public.brand_messages;
drop policy if exists "brand_messages owner update" on public.brand_messages;

-- A brand reads every message on its own campaigns — its own
-- messages and the admin's replies.
create policy "brand_messages brand select own campaign" on public.brand_messages
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = brand_messages.campaign_id
        and c.user_id = auth.uid()
    )
  );

-- A brand writes only its own messages, only on its own campaigns.
create policy "brand_messages brand insert own" on public.brand_messages
  for insert with check (
    user_id = auth.uid()
    and sender = 'brand'
    and exists (
      select 1 from public.campaigns c
      where c.id = brand_messages.campaign_id
        and c.user_id = auth.uid()
    )
  );

-- The owner reads every message.
create policy "brand_messages owner select all" on public.brand_messages
  for select using (public.is_admin());

-- The owner replies as sender 'admin'.
create policy "brand_messages owner insert admin" on public.brand_messages
  for insert with check (
    public.is_admin()
    and sender = 'admin'
  );

-- The owner may update messages, but the trigger below limits that
-- to marking them read — nothing else may change.
create policy "brand_messages owner update" on public.brand_messages
  for update using (public.is_admin()) with check (public.is_admin());

-- The is_read-only guard from 0014 stays as-is (function and
-- trigger already exist); it is not re-created here.

-- Private bucket for payment proof screenshots.
insert into storage.buckets (id, name, public)
values ('brand-proofs', 'brand-proofs', false)
on conflict (id) do nothing;

-- Brands upload proof images under their own campaigns only
-- (object path: <campaign_id>/<uuid>.<ext>).
drop policy if exists "brand-proofs brand upload own campaign" on storage.objects;
create policy "brand-proofs brand upload own campaign" on storage.objects
  for insert with check (
    bucket_id = 'brand-proofs'
    and exists (
      select 1 from public.campaigns c
      where c.id::text = storage.foldername(name)[1]
        and c.user_id = auth.uid()
    )
  );

-- Brands view proof images on their own campaigns only.
drop policy if exists "brand-proofs brand select own campaign" on storage.objects;
create policy "brand-proofs brand select own campaign" on storage.objects
  for select using (
    bucket_id = 'brand-proofs'
    and exists (
      select 1 from public.campaigns c
      where c.id::text = storage.foldername(name)[1]
        and c.user_id = auth.uid()
    )
  );

-- The owner views every proof image.
drop policy if exists "brand-proofs owner select all" on storage.objects;
create policy "brand-proofs owner select all" on storage.objects
  for select using (
    bucket_id = 'brand-proofs'
    and public.is_admin()
  );
