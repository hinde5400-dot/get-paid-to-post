-- GET PAID TO POST — release matured 72-hour holds (0011)
--
-- BUG FIX (found in audit, 2026-11-07): approved earnings were
-- credited to pending_balance by Admin Review, but NOTHING ever
-- moved them to available_balance — creators could never withdraw,
-- no matter how long they waited. The fix is this SECURITY DEFINER
-- function: it moves each approved submission's earnings from
-- pending to available exactly once, the first time its hold_until
-- has passed. The app calls it lazily on every wallet read
-- (lib/data.ts getWallet + the withdrawal route), so no cron job and
-- no service key are needed. It can only move money that is already
-- due, to its rightful owner — calling it early or twice is harmless.
-- Run once in the Supabase SQL Editor.

alter table public.submissions
  add column if not exists hold_released_at timestamptz;

create or replace function public.release_matured_holds()
returns integer language plpgsql security definer
set search_path = public as $$
declare
  r record;
  released int := 0;
begin
  -- FOR UPDATE locks each row so two concurrent calls cannot
  -- release the same submission twice.
  for r in
    select id, user_id, earnings
    from public.submissions
    where status = 'approved'
      and earnings > 0
      and hold_until is not null
      and hold_until <= now()
      and hold_released_at is null
    for update
  loop
    update public.wallets
      set available_balance = available_balance + r.earnings,
          pending_balance = greatest(0, pending_balance - r.earnings),
          updated_at = now()
      where user_id = r.user_id;
    if found then
      update public.submissions
        set hold_released_at = now()
        where id = r.id;
      released := released + 1;
    end if;
  end loop;
  return released;
end; $$;

grant execute on function public.release_matured_holds() to anon, authenticated;
