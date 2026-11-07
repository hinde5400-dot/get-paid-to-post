-- GET PAID TO POST — brand messages (0014)
--
-- Private brand -> admin inbox. After a brand pays the campaign
-- budget in USDT, it can message the admin and send a proof link
-- (screenshot hosted on Google Drive / Imgur) from the payment page.
-- The owner's personal email stays hidden and the proof stays
-- attached to the campaign. There is no email service; this inbox
-- is the contact channel.
--
-- 1) brand_messages: one row per message. proof_url is an optional
--    link the brand pastes (no file uploads — no storage bucket).
-- 2) RLS: a brand inserts/selects only its own messages; the owner
--    selects all and may update ONLY is_read (enforced by the
--    trigger below, same pattern as 0010/0013). No DELETE policy.
--
-- The app reads the table as optional with fallbacks, so this
-- migration is safe to run after the code deploy.

create table if not exists public.brand_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  proof_url text null,
  created_at timestamptz not null default now(),
  is_read boolean not null default false
);

alter table public.brand_messages enable row level security;

-- A brand sends messages on its own campaigns only.
drop policy if exists "brand_messages brand insert own" on public.brand_messages;
create policy "brand_messages brand insert own" on public.brand_messages
  for insert with check (user_id = auth.uid());

-- A brand reads only its own messages.
drop policy if exists "brand_messages brand select own" on public.brand_messages;
create policy "brand_messages brand select own" on public.brand_messages
  for select using (user_id = auth.uid());

-- The owner reads every brand message (the admin inbox).
drop policy if exists "brand_messages owner select all" on public.brand_messages;
create policy "brand_messages owner select all" on public.brand_messages
  for select using (public.is_admin());

-- The owner may update messages, but the trigger below limits that
-- to marking them read — nothing else may change.
drop policy if exists "brand_messages owner update" on public.brand_messages;
create policy "brand_messages owner update" on public.brand_messages
  for update using (public.is_admin()) with check (public.is_admin());

-- Guard: on any update, only is_read may differ from the old row.
-- Brands have no update policy at all, so this only ever runs for
-- the owner marking a message read.
create or replace function public.enforce_brand_message_update()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  new_copy public.brand_messages;
begin
  -- Only is_read may differ from the old row.
  new_copy := new;
  new_copy.is_read := old.is_read;
  if new_copy is distinct from old then
    raise exception 'Only marking a message as read is allowed.';
  end if;
  return new;
end; $$;

drop trigger if exists brand_messages_read_guard on public.brand_messages;
create trigger brand_messages_read_guard
  before update on public.brand_messages
  for each row execute function public.enforce_brand_message_update();
