-- GET PAID TO POST — brand payments (0013)
--
-- Brands pay their campaign budget in USDT (TRC20) to the admin
-- wallet and paste the Transaction ID on a payment page; the admin
-- verifies the payment and only then approves the campaign live.
--
-- 1) site_settings: key/value store for admin settings. Only one
--    key is public-read (the USDT wallet address brands must send
--    money to); every other key is owner-only, and all writes are
--    owner-only. No DELETE policy.
-- 2) campaigns.user_id: who owns the campaign, so a brand can read
--    their own pending campaign (public read is live+funded only)
--    and record its payment Transaction ID. Old rows have no owner
--    (there are no campaigns yet); the API sets it on insert.
-- 3) campaigns.payment_tx_id: the Transaction ID / hash the brand
--    pasted after sending the budget. Null until submitted.
-- 4) Drop the old budget_total >= 500 check (the $500 minimum was
--    removed — a brand sets any budget above $0) and replace it with
--    a budget_total > 0 check.
-- 5) A brand may update ONLY the payment_tx_id of their own pending
--    campaign (enforced by a trigger, same pattern as 0010); the
--    owner bypasses the trigger for Admin Review.
--
-- The app reads user_id / payment_tx_id as optional with fallbacks,
-- so this migration is safe to run after the code deploy.

-- 1) Admin settings store.
create table if not exists public.site_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

-- The USDT wallet address is a public payment address: anyone may
-- read that one key (brands need it to pay). No other key is public.
drop policy if exists "site_settings public wallet read" on public.site_settings;
create policy "site_settings public wallet read" on public.site_settings
  for select using (key = 'admin_usdt_wallet');

drop policy if exists "site_settings owner read all" on public.site_settings;
create policy "site_settings owner read all" on public.site_settings
  for select using (public.is_admin());

drop policy if exists "site_settings owner insert" on public.site_settings;
create policy "site_settings owner insert" on public.site_settings
  for insert with check (public.is_admin());

drop policy if exists "site_settings owner update" on public.site_settings;
create policy "site_settings owner update" on public.site_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- 2) Campaign ownership + payment Transaction ID.
alter table public.campaigns
  add column if not exists user_id uuid references public.users(id) on delete set null,
  add column if not exists payment_tx_id text;

-- A brand reads their own campaigns (pending ones are not public).
drop policy if exists "campaigns read own" on public.campaigns;
create policy "campaigns read own" on public.campaigns
  for select using (auth.uid() = user_id);

-- A brand updates their own campaign row; the trigger below limits
-- what a non-owner may actually change (payment_tx_id only).
drop policy if exists "campaigns update own payment" on public.campaigns;
create policy "campaigns update own payment" on public.campaigns
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5) Guard: a non-owner may change ONLY the payment Transaction ID
--    of a pending campaign. Anything else is rejected. The owner
--    bypasses the trigger (Admin Review approve / reject).
create or replace function public.enforce_campaign_payment_update()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  new_copy public.campaigns;
begin
  if public.is_admin() then
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'Only a pending campaign can record a payment.';
  end if;
  -- Only payment_tx_id may differ from the old row.
  new_copy := new;
  new_copy.payment_tx_id := old.payment_tx_id;
  if new_copy is distinct from old then
    raise exception 'Only the payment Transaction ID can be changed by a brand.';
  end if;
  return new;
end; $$;

drop trigger if exists campaigns_payment_guard on public.campaigns;
create trigger campaigns_payment_guard
  before update on public.campaigns
  for each row execute function public.enforce_campaign_payment_update();

-- 4) The $500 budget minimum is gone: any budget above $0.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'campaigns_budget_total_check'
  ) then
    alter table public.campaigns drop constraint campaigns_budget_total_check;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_budget_total_positive'
  ) then
    alter table public.campaigns
      add constraint campaigns_budget_total_positive
      check (budget_total > 0) not valid;
  end if;
end $$;
