-- GET PAID TO POST — creator / brand roles (0008)
--
-- Signup now splits into two roles: creators (Full Name) and brands
-- (Brand Name). The role is saved in the auth user's metadata at
-- signup and copied to public.users by the handle_new_user trigger
-- below. Existing users get role 'creator' by default. The app reads
-- role as optional and treats a missing value as 'creator', so this
-- migration is safe to run after the code deploy.
-- Run once in the Supabase SQL Editor, before 0010 (the RLS
-- hardening trigger in 0010 references the role column).

alter table public.users
  add column if not exists role text not null default 'creator',
  add column if not exists brand_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_role_check'
  ) then
    alter table public.users
      add constraint users_role_check
      check (role in ('creator', 'brand')) not valid;
  end if;
end $$;

-- Rewritten trigger function: same owner logic as before, plus the
-- role and brand name from the signup metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  admin_exists boolean;
  new_role text;
begin
  select exists (select 1 from public.users where is_admin = true)
    into admin_exists;
  new_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'creator');
  if new_role not in ('creator', 'brand') then
    new_role := 'creator';
  end if;
  insert into public.users (id, email, is_admin, full_name, role, brand_name)
    values (
      new.id,
      new.email,
      not admin_exists,
      new.raw_user_meta_data->>'full_name',
      new_role,
      nullif(new.raw_user_meta_data->>'brand_name', '')
    )
    on conflict (id) do update
      set full_name = coalesce(public.users.full_name, excluded.full_name),
          role = coalesce(public.users.role, excluded.role),
          brand_name = coalesce(public.users.brand_name, excluded.brand_name);
  insert into public.wallets (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end; $$;
