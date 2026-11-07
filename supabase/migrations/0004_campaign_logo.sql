-- GET PAID TO POST — brand logo URL on campaigns (0004)
-- Optional logo URL a brand can paste in the brand form. Shown on the
-- campaign card banner and the brand page when present; brand initials
-- are used when it is empty. Run once in the Supabase SQL Editor.
-- NOTE: this file is 0004 because 0003 is the campaign_stats function
-- (public.campaign_stats) — do not renumber either file.

alter table public.campaigns
  add column if not exists logo_url text;
