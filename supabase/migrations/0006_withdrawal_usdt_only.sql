-- GET PAID TO POST — withdrawals are USDT-only (0006)
--
-- Creator withdrawals are now USDT (TRC20) or USDT (BEP20) only.
-- Pakistani bank, Wise, PayPal, JazzCash and Easypaisa are removed.
--
-- The old method check was created inline in 0002, so its generated
-- name is found dynamically and dropped below. Existing rows are NOT
-- re-validated (NOT VALID): any old-method rows stay as they are and
-- new rows must use usdt_trc20 or usdt_bep20.

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.withdrawals'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%method%'
  loop
    execute format('alter table public.withdrawals drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.withdrawals
  add constraint withdrawals_method_usdt_only
  check (method in ('usdt_trc20', 'usdt_bep20')) not valid;
