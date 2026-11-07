-- GET PAID TO POST — max payout per post cap on campaigns (0007)
--
-- Every campaign sets the most a creator can earn on ONE post, even
-- if the views would pay more. Default $75, allowed range $10–$200.
-- The cap is applied in the admin-review earnings flow
-- (api/admin/review) and shown on campaign cards as
-- "Up to $75 per post". Existing rows get the $75 default.
-- Run once in the Supabase SQL Editor.

alter table public.campaigns
  add column if not exists max_payout_per_post numeric default 75;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_max_payout_range'
  ) then
    alter table public.campaigns
      add constraint campaigns_max_payout_range
      check (max_payout_per_post between 10 and 200) not valid;
  end if;
end $$;
