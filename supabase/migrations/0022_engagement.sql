-- GET PAID TO POST — engagement counts for the 1% minimum (0022)
--
-- P0 batch 3 (2026-11-09, Turn's decision): every clip needs a
-- minimum 1% engagement rate — (likes + comments) / views, likes and
-- comments ONLY (never shares/saves), at any view count. The
-- refresh currently fetches views only, so engagement could not be
-- computed at all.
--
-- (a) Add a `comments` column to submissions. `likes` already
--     exists (migration 0002); `comments` was missing entirely.
-- (b) Extend apply_view_refresh so the refresh can store the
--     freshly fetched likes/comments alongside views. The new
--     parameters default to 0, so the old two-argument call still
--     works — a refresh that cannot fetch engagement (e.g. a
--     platform that returns views only) leaves the stored counts
--     untouched by passing the current stored values, never by
--     zeroing them. The function only ever writes a still-pending
--     submission, as before.
-- (c) Keep the zero-numbers insert rule consistent: new rows start
--     with comments = 0, like views/likes.
--
-- No data migration: the live database has ZERO submissions.
-- Run once in the Supabase SQL Editor.

-- (a) Comments column.
alter table public.submissions
  add column if not exists comments bigint not null default 0;

-- The refresh list also returns the stored likes/comments, so the
-- refresh code can keep them when a platform does not return fresh
-- engagement numbers instead of zeroing them.
create or replace function public.list_pending_submissions_for_refresh()
returns table (
  id uuid,
  user_id uuid,
  platform text,
  post_url text,
  views bigint,
  likes bigint,
  comments bigint,
  views_refreshed_at timestamptz
)
language sql security definer
set search_path = public as $$
  select s.id, s.user_id, s.platform, s.post_url, s.views,
         s.likes, s.comments, s.views_refreshed_at
  from public.submissions s
  where s.status = 'pending'
    and s.created_at > now() - interval '14 days'
  order by s.views_refreshed_at asc nulls first, s.created_at asc
  limit 200;
$$;

grant execute on function public.list_pending_submissions_for_refresh()
  to anon, authenticated;

-- (b) Refresh stores likes + comments with views.
create or replace function public.apply_view_refresh(
  p_submission_id uuid,
  p_views bigint,
  p_likes bigint default 0,
  p_comments bigint default 0
)
returns boolean
language plpgsql security definer
set search_path = public as $$
begin
  update public.submissions
    set views = greatest(0, p_views),
        likes = greatest(0, p_likes),
        comments = greatest(0, p_comments),
        views_refreshed_at = now()
    where id = p_submission_id
      and status = 'pending';
  return found;
end; $$;

grant execute on function public.apply_view_refresh(uuid, bigint, bigint, bigint)
  to anon, authenticated;

-- (c) New submissions start with zero comments too.
drop policy if exists "submissions own insert" on public.submissions;
create policy "submissions own insert" on public.submissions
  for insert with check (
    auth.uid() = user_id
    and status = 'pending'
    and earnings = 0
    and views = 0
    and likes = 0
    and comments = 0
  );
