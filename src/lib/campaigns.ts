import type { Campaign } from "./types";
import { budgetRemainingPct } from "./money";

/**
 * Pure, client-safe campaign helpers (P1-a, Content Rewards model).
 * This module imports nothing server-only, so cards, modals and the
 * banner can use the same live/settling definitions as the server
 * pages. src/lib/data.ts re-exports isCampaignLive /
 * isCampaignSettling so existing server imports keep working.
 */

/**
 * A campaign is live only while it is funded, status "live", has
 * budget left, and its duration has not run out (ends_at null means
 * it runs until the budget ends). Same definition the cleanup job
 * inverts (supabase/migrations/0023_cleanup_ended_campaigns.sql).
 */
export function isCampaignLive(c: Campaign, now: number = Date.now()): boolean {
  if (!c.is_funded || c.status !== "live") return false;
  if (c.budget_left <= 0) return false;
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return false;
  return true;
}

/**
 * Settling = the campaign ENDED (same end definition as
 * isCampaignLive, inverted: budget_left <= 0 OR ends_at passed) but
 * is still in the database because the cleanup job has not deleted
 * it yet. Cleanup deletes only >= 7 days after the end (3-day
 * re-check + 3-day/72h hold + 1-day buffer, migration 0023), so a
 * settling campaign stays visible with this status for that whole
 * window. Pending / unfunded / draft campaigns are NOT settling.
 */
export function isCampaignSettling(
  c: Campaign,
  now: number = Date.now()
): boolean {
  return c.is_funded && c.status === "live" && !isCampaignLive(c, now);
}

/** "live" | "settling" | "other" (pending, draft, unfunded, …). */
export function campaignStatus(
  c: Campaign,
  now: number = Date.now()
): "live" | "settling" | "other" {
  if (isCampaignLive(c, now)) return "live";
  if (isCampaignSettling(c, now)) return "settling";
  return "other";
}

export type CampaignSort =
  | "recommended"
  | "highest"
  | "new"
  | "trending"
  | "ending";

/**
 * Sort definitions (Content Rewards board model, P1-a).
 * Filters are applied BEFORE this sort (platform, then category);
 * this function only orders the already-filtered list.
 *
 * - recommended (default): live campaigns first, then by most
 *   budget remaining % (creators should join campaigns that can
 *   still pay), then newest.
 * - highest: by rate per 1,000 views (view_bonus_per_1k) descending.
 * - new: by created_at descending.
 * - trending: by creator/submission activity descending (count of
 *   submissions, then newest). Needs the stats map; a campaign
 *   with no stats is treated as 0 submissions.
 * - ending: by ends_at ascending — campaigns with a deadline first,
 *   open-ended campaigns (ends_at null) last, then newest.
 */
export function sortCampaigns(
  list: Campaign[],
  sort: CampaignSort,
  // CampaignStats shape (defined in src/lib/data.ts) — only `total`
  // (submission count) is needed for the Trending sort.
  statsById: Record<string, { total: number } | null> = {}
): Campaign[] {
  const out = [...list];
  const createdAt = (c: Campaign) => new Date(c.created_at ?? 0).getTime();
  switch (sort) {
    case "highest":
      return out.sort((a, b) => b.view_bonus_per_1k - a.view_bonus_per_1k);
    case "new":
      return out.sort((a, b) => createdAt(b) - createdAt(a));
    case "trending":
      return out.sort((a, b) => {
        const ta = statsById[a.id]?.total ?? 0;
        const tb = statsById[b.id]?.total ?? 0;
        if (tb !== ta) return tb - ta;
        return createdAt(b) - createdAt(a);
      });
    case "ending":
      return out.sort((a, b) => {
        const ea = a.ends_at ? new Date(a.ends_at).getTime() : Infinity;
        const eb = b.ends_at ? new Date(b.ends_at).getTime() : Infinity;
        if (ea !== eb) return ea - eb;
        return createdAt(b) - createdAt(a);
      });
    case "recommended":
    default:
      return out.sort((a, b) => {
        const la = isCampaignLive(a) ? 0 : 1;
        const lb = isCampaignLive(b) ? 0 : 1;
        if (la !== lb) return la - lb;
        const pa = budgetRemainingPct(a.budget_total, a.budget_left);
        const pb = budgetRemainingPct(b.budget_total, b.budget_left);
        if (pb !== pa) return pb - pa;
        return createdAt(b) - createdAt(a);
      });
  }
}
