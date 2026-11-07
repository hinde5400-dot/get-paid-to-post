-- GET PAID TO POST — store the creator's full name (0005)
--
-- Signup now asks for a full name. The name is saved in the auth
-- user's metadata at signup and copied to public.users by the
-- handle_new_user trigger below. The app reads full_name as optional
-- and falls back to the email address, so this migration is safe to
-- run after the code deploy.

alter table public.users
  add column if not exists full_name text;

-- Rewritten trigger function: same owner logic as before, plus the
-- full name from the signup metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  admin_exists boolean;
begin
  select exists (select 1 from public.users where is_admin = true)
    into admin_exists;
  insert into public.users (id, email, is_admin, full_name)
    values (new.id, new.email, not admin_exists, new.raw_user_meta_data->>'full_name')
    on conflict (id) do update
      set full_name = coalesce(public.users.full_name, excluded.full_name);
  insert into public.wallets (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end; $$;
