-- GET PAID TO POST — campaign categories (0024)
--
-- P1-a (2026-11-09, Content Rewards model): campaigns get a real
-- category — UGC, Clipping, Lifestyle, Entertainment, Gaming or
-- Technology. The `category` column already exists (migration 0001,
-- text not null) but every insert hardcoded "General", so this
-- migration only backfills legacy values and constrains the column
-- to the six real categories. The brand form (BrandForm) and the API
-- (POST /api/campaigns) enforce the same list in code.
--
-- Run once in the Supabase SQL Editor.

-- Legacy rows ("General" and anything else outside the six) become
-- UGC, the brand-form default.
update public.campaigns
set category = 'UGC'
where category not in (
  'UGC', 'Clipping', 'Lifestyle', 'Entertainment', 'Gaming', 'Technology'
);

-- Enforce the six categories at the database level (idempotent:
-- skipped when the constraint already exists).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campaigns_category_check'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_category_check
      check (category in (
        'UGC', 'Clipping', 'Lifestyle', 'Entertainment', 'Gaming', 'Technology'
      ));
  end if;
end $$;
