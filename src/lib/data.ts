import { MAX_PAYOUT_DEFAULT } from "./constants";
import { getServerClient } from "./supabase/server";
import type { BrandMessage, Campaign, Submission, Wallet, Withdrawal } from "./types";
import { platformsFromRow, ratesFromRow, rateForPlatform } from "./types";

function mapCampaign(row: Record<string, unknown>): Campaign {
  // Platforms (migration 0012): the platforms array when present,
  // otherwise the legacy single platform column. The legacy platform
  // field keeps the old convention — 'all' when all three are chosen,
  // otherwise the first chosen platform — so old code paths keep working.
  const platforms = platformsFromRow(row);
  const mapped: Campaign = {
    id: String(row.id),
    brand_name: String(row.brand_name ?? ""),
    // Campaign owner (migration 0013) and payment Transaction ID.
    user_id: (row.user_id as string | null) ?? null,
    payment_tx_id: (row.payment_tx_id as string | null) ?? null,
    // logo_url is optional (added by migration 0004) — brand initials
    // are shown when it is empty.
    logo_url: (row.logo_url as string | null) ?? null,
    title: String(row.title ?? ""),
    rate_per_1m: Number(row.rate_per_1m ?? 0),
    budget_total: Number(row.budget_total ?? 0),
    budget_left: Number(row.budget_left ?? 0),
    // Total paid out so far (migration 0001) — burn-rate input for
    // the "time left at current rate" estimate (P1-a).
    paid_out: Number(row.paid_out ?? 0),
    // 15% flat platform fee (migration 0021); rows written before
    // it have no fee column and fall back to 0.
    platform_fee: Number(row.platform_fee ?? 0),
    spots_left: Number(row.spots_left ?? 0),
    spots_total: Number(row.spots_total ?? 0),
    category: String(row.category ?? "General"),
    platform: platforms.length === 3 ? "all" : platforms[0],
    platforms,
    description: String(row.description ?? ""),
    rules: (row.rules as string | null) ?? null,
    view_bonus_per_1k: Number(row.view_bonus_per_1k ?? 0),
    // Per-platform rates (P1-b, migration 0025) — LEGACY. The
    // rates map is kept in the DB so old rows still parse, but
    // every platform carries the same single rate
    // (view_bonus_per_1k) and rateForPlatform() ignores this map
    // entirely: ONE rate per 1,000 views for the whole campaign.
    rates: ratesFromRow(row),
    // Minimum views per clip (P1-b; floor 1,000, migration 0028):
    // default 1000, minimum 1000 — a brand may set a higher
    // threshold, never a lower one.
    min_views: Number(row.min_views ?? 1000),
    // Per-creator $ cap (P1-b): null = no cap (default).
    max_payout_per_creator:
      row.max_payout_per_creator == null
        ? null
        : Number(row.max_payout_per_creator),
    // Per-post cap (migration 0007); older rows fall back to the old
    // per-video / earn-up-to value, then the $100 default.
    max_payout_per_post: Number(
      row.max_payout_per_post ?? row.max_per_video ?? row.earn_up_to ?? MAX_PAYOUT_DEFAULT
    ),
    views_tracked_days: Number(row.views_tracked_days ?? 14),
    max_posts: Number(row.max_posts ?? 7),
    earn_up_to: Number(row.earn_up_to ?? 300),
    is_funded: Boolean(row.is_funded),
    status: String(row.status ?? "pending"),
    created_at: String(row.created_at ?? ""),
    // Campaign assets + schedule (migration 0009) — all optional so
    // rows created before the migration still map cleanly.
    brief_url: (row.brief_url as string | null) ?? null,
    thumbnail_url: (row.thumbnail_url as string | null) ?? null,
    duration_days:
      row.duration_days == null ? null : Number(row.duration_days),
    started_at: (row.started_at as string | null) ?? null,
    ends_at: (row.ends_at as string | null) ?? null,
  };
  // TxID submission time (migration 0038) — the Campaign type in
  // lib/types.ts does not declare it yet (another file's change),
  // so it is attached here without a type edit: the admin card
  // reads it to show "payment unverified for X days", and
  // isExpiredUnpaidPending below reads it off the raw row.
  (mapped as unknown as Record<string, unknown>).payment_tx_submitted_at =
    (row.payment_tx_submitted_at as string | null) ?? null;
  return mapped;
}

function mapSubmission(row: Record<string, unknown>): Submission {
  const mapped: Submission = {
    id: String(row.id),
    submission_code: String(row.submission_code ?? ""),
    user_id: String(row.user_id ?? ""),
    campaign_id: String(row.campaign_id ?? ""),
    campaign_title: (row.campaign_title as string | undefined) ?? undefined,
    bundle_id: String(row.bundle_id ?? ""),
    post_url: String(row.post_url ?? ""),
    platform: (row.platform as Submission["platform"]) ?? "tiktok",
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    status: (row.status as Submission["status"]) ?? "pending",
    earnings: Number(row.earnings ?? 0),
    rejection_reason: (row.rejection_reason as string | null) ?? null,
    hold_until: (row.hold_until as string | null) ?? null,
    views_refreshed_at: (row.views_refreshed_at as string | null) ?? null,
    // Posted time (migration 0031, 30-minute submit rule): null
    // on rows written before the migration.
    posted_at: (row.posted_at as string | null) ?? null,
    posted_time_unverified: Boolean(row.posted_time_unverified ?? false),
    // Approval-time facts (migration 0043, Round-5 P1): stored
    // at approve time by the review route, so My Posts can render
    // the budget-cap fact instead of inferring it from
    // post-approval view growth. All mapSubmission call sites
    // load rows with select("*"), which never errors on a missing
    // column — on the pre-0043 DB the keys are simply absent, so
    // these defaults keep the mapper working with no guard.
    budget_capped: Boolean(row.budget_capped ?? false),
    approval_views:
      row.approval_views == null ? null : Number(row.approval_views),
    // Instagram handle that matched at submit time (migration
    // 0039, round-3 P2-17).
    instagram_handle_matched:
      (row.instagram_handle_matched as string | null) ?? null,
    how_made: String(row.how_made ?? ""),
    proof_screenshots: Array.isArray(row.proof_screenshots)
      ? (row.proof_screenshots as string[])
      : [],
    is_duplicate: Boolean(row.is_duplicate),
    created_at: String(row.created_at ?? ""),
    updated_at: (row.updated_at as string | null) ?? null,
  };
  // Approval-time rate/cap (migration 0044, Round-6 C4): the
  // rate per 1k and max payout/post in force at approve time, so
  // My Posts renders history from approval-time values, never
  // the campaign's current rate/cap. Attached via cast — the
  // Submission type gains these fields in a companion change;
  // until then they are plain runtime properties. select("*")
  // never errors on a missing column, so on the pre-0044 DB the
  // keys are simply absent and both stay null (never a fake 0).
  const extra = mapped as unknown as Record<string, unknown>;
  extra.approval_rate =
    row.approval_rate == null ? null : Number(row.approval_rate);
  extra.approval_max_payout =
    row.approval_max_payout == null
      ? null
      : Number(row.approval_max_payout);
  return mapped;
}

// Live / settling definitions live in src/lib/campaigns.ts (pure,
// client-safe) and are re-exported here so existing server imports
// (`from "@/lib/data"`) keep working.
export { isCampaignLive, isCampaignSettling, campaignStatus } from "./campaigns";
import { isCampaignLive } from "./campaigns";

/**
 * 7-day expiry for unpaid pending campaigns — the SAME rule as
 * migration 0038's campaign_expired_unpaid_pending() predicate,
 * so the API routes and the daily cron can never drift apart.
 *
 * A TxID on file is NOT payment any more (round-3 P1-7): a TxID
 * only counts once it is verified, and verification happens at
 * approve time, which flips the status — so any row still pending
 * with a TxID is by definition unverified. The rule:
 *   - no TxID (null or empty — chat messages and screenshots do
 *     NOT count as payment): created_at is 7 or more days old;
 *   - TxID on file: payment_tx_submitted_at (migration 0038,
 *     stamped by the payment route on first submit and on every
 *     correction) is 7 or more days old. A correction restarts
 *     the 7-day window — it is a new submission of payment proof.
 *   - TxID on file but no timestamp (a pre-0038 legacy row):
 *     falls back to created_at, so an old TxID can no longer
 *     defeat expiry forever.
 * "Unpaid" means "no verified payment", not "not is_funded":
 * is_funded only becomes true at approve time.
 */
export const UNPAID_PENDING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function isExpiredUnpaidPending(campaign: {
  status?: string | null;
  payment_tx_id?: string | null;
  payment_tx_submitted_at?: string | null;
  created_at?: string | null;
}): boolean {
  if (campaign.status !== "pending") return false;
  // The clock starts at the TxID submission when one is on file,
  // at creation when there is none (or when a legacy TxID row has
  // no timestamp to start from).
  const hasTxId = Boolean(String(campaign.payment_tx_id ?? "").trim());
  const sinceRaw =
    hasTxId && campaign.payment_tx_submitted_at
      ? campaign.payment_tx_submitted_at
      : campaign.created_at;
  const since = sinceRaw ? new Date(sinceRaw).getTime() : NaN;
  if (!Number.isFinite(since)) return false;
  return Date.now() - since >= UNPAID_PENDING_EXPIRY_MS;
}

/**
 * Chunked "unpaged" fetch (Round-4 P1-A1): PostgREST returns at
 * most 1,000 rows per request when no limit is given, so any
 * loader that claims to return "every" row must page in 1,000-row
 * chunks until a short page arrives — the same pattern as
 * getCreatorBotRejections below. `fetchPage` receives the chunk
 * offset and size and returns the raw rows (or a PostgREST error).
 * Throws on DB error, per the Forms #26 contract.
 */
async function fetchAllPages(
  fetchPage: (
    offset: number,
    chunk: number
  ) => Promise<{
    rows: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>
): Promise<Record<string, unknown>[]> {
  const CHUNK = 1000;
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += CHUNK) {
    const { rows, error } = await fetchPage(offset, CHUNK);
    if (error) throw new Error(error.message);
    if (!rows) throw new Error("Could not load data.");
    all.push(...rows);
    if (rows.length < CHUNK) break;
  }
  return all;
}

/**
 * Live funded campaigns from Supabase only. There are no sample or
 * fallback campaigns: a campaign appears here only after a brand has
 * funded its budget and it is live. When none exist, this returns []
 * and the site shows an honest "No funded campaigns yet" empty state.
 */
export async function getCampaigns(): Promise<Campaign[]> {
  const supabase = getServerClient();
  if (supabase) {
    // P1-A1: chunked to exhaustion — an unpaged select silently
    // caps at 1,000 rows (PostgREST default), so past 1,000 live
    // campaigns the oldest ones vanished from Home.
    const rows = await fetchAllPages(async (offset, chunk) => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("is_funded", true)
        .eq("status", "live")
        .order("created_at", { ascending: false })
        .range(offset, offset + chunk - 1);
      return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
    });
    // Forms #26 contract: a database error THROWS instead of
    // returning [] — [] means "no live campaigns", never "the
    // load failed". Callers render an honest error state.
    const now = Date.now();
    return rows.map(mapCampaign).filter((c) => isCampaignLive(c, now));
  }
  return [];
}

/**
 * Discover list (P1-a): live campaigns PLUS settling ones — funded,
 * status "live" campaigns that have ended (budget_left <= 0 OR
 * ends_at passed) but have not been auto-deleted yet. The cleanup
 * job (migration 0023) deletes an ended campaign only >= 7 days
 * after it ended (3-day re-check + 3-day/72h hold + 1-day buffer),
 * so until then it stays visible here with a "Settling" badge and
 * no submit form. The page sorts live first by default. Home and
 * the navbar keep using getCampaigns() (live only).
 */
export async function getDiscoverCampaigns(): Promise<Campaign[]> {
  const supabase = getServerClient();
  if (supabase) {
    // P1-A1: chunked to exhaustion (see fetchAllPages) — the
    // unpaged select silently capped at 1,000 rows.
    const rows = await fetchAllPages(async (offset, chunk) => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("is_funded", true)
        .eq("status", "live")
        .order("created_at", { ascending: false })
        .range(offset, offset + chunk - 1);
      return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
    });
    // Forms #26 contract: throw on DB error, never [] (see
    // getCampaigns).
    return rows.map(mapCampaign);
  }
  return [];
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const supabase = getServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .single();
    if (!error && data) return mapCampaign(data as Record<string, unknown>);
  }
  return null;
}

/** Campaigns waiting for admin review (status = "pending"), oldest first. */
export async function getPendingCampaigns(): Promise<Campaign[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  // P1-A1: chunked to exhaustion (see fetchAllPages) — the
  // unpaged select silently capped at 1,000 rows.
  const rows = await fetchAllPages(async (offset, chunk) => {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .range(offset, offset + chunk - 1);
    return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
  });
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns).
  return rows.map(mapCampaign);
}

/**
 * Rejected campaigns, newest first — owner only. The /admin
 * refund queue (Round-4 P1-A2): a rejected campaign appears in no
 * other admin list, so without this loader a brand that paid and
 * then got rejected had no admin-visible record to trigger the
 * manual USDT refund. Chunked to exhaustion like the other
 * unpaged loaders (P1-A1). Pair with
 * getCampaignRejectionReasons() for the reason (stored only as a
 * brand-chat message) and getOpenRefundRequests() for refund
 * requests. Throws on DB error, per the Forms #26 contract.
 */
export async function getRejectedCampaigns(): Promise<Campaign[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const rows = await fetchAllPages(async (offset, chunk) => {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "rejected")
      .order("created_at", { ascending: false })
      .range(offset, offset + chunk - 1);
    return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
  });
  return rows.map(mapCampaign);
}

/**
 * Campaigns owned by one brand (campaigns.user_id, migration 0013),
 * newest first — the brand dashboard list. RLS ("campaigns read
 * own", migration 0013) lets a brand read its own campaigns,
 * including pending ones that are not public yet.
 */
export async function getBrandCampaigns(userId: string): Promise<Campaign[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    // Round-4 P2-A3: explicit 2,000-row cap, disclosed — past
    // 2,000 campaigns the OLDEST rows drop out of the brand
    // dashboard list (same truncation class as getAllWithdrawals).
    // A brand with that many campaigns does not exist today.
    .limit(2000);
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns).
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load your campaigns.");
  return (data as Record<string, unknown>[]).map(mapCampaign);
}

/**
 * Per-campaign stats for a brand's own dashboard: submission counts
 * from the SECURITY DEFINER campaign_stats function (migration
 * 0003, same as getCampaignStats) plus total views across all
 * submissions on the campaign.
 *
 * Views come from campaign_stats.total_views (migration 0029).
 * Until 0029 is run, the function returns no total_views column
 * and the direct read below keeps it honest: when the campaign
 * genuinely has no submissions, views are 0; when it has
 * submissions but the views read came back empty, the views are
 * RLS-blocked and total_views is null (shown as "—", never a fake
 * 0).
 */
export interface BrandCampaignStats extends CampaignStats {
  total_views: number | null;
}

export async function getBrandCampaignStats(
  campaignId: string
): Promise<BrandCampaignStats | null> {
  const stats = await getCampaignStats(campaignId);
  if (!stats) return null;
  // Migration 0029: the RPC already summed the views for us.
  if (stats.total_views !== null) {
    return { ...stats, total_views: stats.total_views };
  }
  const supabase = getServerClient();
  if (!supabase) return { ...stats, total_views: null };
  let total_views: number | null = null;
  try {
    // Round-6 C5: chunked to exhaustion — the old unpaged select
    // silently capped at 1,000 rows, undercounting total views on
    // a campaign with 1,000+ approved submissions.
    const rows = await fetchAllPages(async (offset, chunk) => {
      const { data, error } = await supabase
        .from("submissions")
        .select("views")
        .eq("campaign_id", campaignId)
        .eq("status", "approved")
        .range(offset, offset + chunk - 1);
      return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
    });
    if (rows.length > 0) {
      total_views = rows.reduce(
        (s, r) => s + Number(r.views ?? 0),
        0
      );
    } else {
      // No readable rows: genuinely zero views only when the
      // campaign has no submissions at all (stats.total === 0);
      // otherwise the views are RLS-blocked, not zero.
      total_views = stats.total === 0 ? 0 : null;
    }
  } catch {
    total_views = null;
  }
  return { ...stats, total_views };
}

/**
 * Real per-campaign stats, or null when they cannot be computed.
 * Uses the SECURITY DEFINER function public.campaign_stats (see
 * supabase/migrations/0003_campaign_stats.sql) so the numbers are real
 * for every viewer. Until that migration is run, the owner still gets
 * real numbers from the RLS-visible rows; anyone else gets null and
 * the UI omits the stat instead of inventing one.
 */
export interface CampaignStats {
  total: number;
  approved: number;
  members: number;
  active30d: number;
  /**
   * Sum of views across all submissions. Present once migration
   * 0029 is run (or from the owner fallback below); null when the
   * function predates 0029 and the views cannot be read.
   */
  total_views: number | null;
}

export async function getCampaignStats(
  campaignId: string
): Promise<CampaignStats | null> {
  const supabase = getServerClient();
  if (!supabase) return null;
  // 1) Public stats function (needs migration 0003).
  const { data, error } = await supabase.rpc("campaign_stats", {
    p_campaign_id: campaignId,
  });
  if (!error && Array.isArray(data) && data.length > 0) {
    const row = data[0] as Record<string, unknown>;
    return {
      total: Number(row.total ?? 0),
      approved: Number(row.approved ?? 0),
      members: Number(row.members ?? 0),
      active30d: Number(row.active_30d ?? 0),
      // total_views exists once migration 0029 is run; before that
      // the column is absent and this is null (never a fake 0).
      total_views:
        row.total_views !== undefined && row.total_views !== null
          ? Number(row.total_views)
          : null,
    };
  }
  // 2) Fallback: the owner can read every submission via RLS.
  // Chunked to exhaustion (Round-6 sweep) — the old unpaged
  // select silently capped at 1,000 rows, undercounting totals
  // on a campaign with 1,000+ submissions.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return null;
  let rows: Record<string, unknown>[];
  try {
    rows = await fetchAllPages(async (offset, chunk) => {
      const { data: page, error: qError } = await supabase
        .from("submissions")
        .select("user_id, status, created_at, views")
        .eq("campaign_id", campaignId)
        .range(offset, offset + chunk - 1);
      return { rows: (page ?? null) as Record<string, unknown>[] | null, error: qError };
    });
  } catch {
    return null;
  }
  const list = rows;
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const active30d = new Set(
    list
      .filter((r) => new Date(String(r.created_at)).getTime() >= cutoff)
      .map((r) => String(r.user_id))
  ).size;
  return {
    total: list.length,
    approved: list.filter((r) => r.status === "approved").length,
    members: new Set(list.map((r) => String(r.user_id))).size,
    active30d,
    // Approved views only — rejected / bot-view clips never count
    // toward the views a brand judges the campaign by.
    total_views: list
      .filter((r) => r.status === "approved")
      .reduce((s, r) => s + Number(r.views ?? 0), 0),
  };
}

export async function getCampaignStatsMap(
  campaignIds: string[]
): Promise<Record<string, CampaignStats | null>> {
  // Round-6 R2: the per-campaign stats calls are independent, so
  // they run in parallel — the old sequential loop made
  // /campaigns (and home) wait for one campaign_stats RPC after
  // another (~2.8s warm). Promise.all keeps the input order, so
  // the returned map is identical, only faster.
  const results = await Promise.all(
    campaignIds.map((id) => getCampaignStats(id))
  );
  const out: Record<string, CampaignStats | null> = {};
  campaignIds.forEach((id, i) => {
    out[id] = results[i];
  });
  return out;
}

/** A creator's submissions, newest first. Empty when Supabase is not set up. */
export async function getUserSubmissions(userId: string): Promise<Submission[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  // Round-6 C1: chunked to exhaustion — the old unpaged select
  // silently capped at 1,000 rows, dropping a creator's oldest
  // submissions from My Posts / the dashboard and undercounting
  // the approved/15 + cooldown display.
  // The "*" select already carries submissions.approval_rate /
  // approval_max_payout (migration 0044) when the columns exist;
  // mapSubmission reads them as optional with a fallback, so
  // rows written before 0044 still map cleanly.
  const rows = await fetchAllPages(async (offset, chunk) => {
    const { data, error } = await supabase
      .from("submissions")
      .select("*, campaigns(title, view_bonus_per_1k, max_payout_per_post, rates, min_views, max_payout_per_creator, budget_left)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + chunk - 1);
    return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
  });
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns). fetchAllPages already throws on DB error, so
  // reaching here means the load succeeded.
  // Active flags (migration 0031): a flagged payout is paused, and
  // the creator must see that on My Posts — the old code fetched
  // submissions only, so a flagged clip looked like an ordinary
  // "Under Review" with no hint anything was paused.
  const flagMap = new Map<string, { reason: string; flagged_at: string }>();
  if (rows.length > 0) {
    try {
      // Chunked in 500-id batches: one .in() with every id would
      // itself grow unbounded on a creator with 1,000+ clips.
      const ids = rows.map((r) => String(r.id));
      for (let i = 0; i < ids.length; i += 500) {
        const { data: flags } = await supabase
          .from("submission_flags")
          .select("submission_id, reason, created_at")
          .in("submission_id", ids.slice(i, i + 500))
          .is("resolved_at", null);
        for (const f of (flags ?? []) as Record<string, unknown>[]) {
          flagMap.set(String(f.submission_id), {
            reason: String(f.reason ?? ""),
            flagged_at: String(f.created_at ?? ""),
          });
        }
      }
    } catch {
      // Pre-migration 0031 — no flags exist, nothing to attach.
    }
  }
  return rows.map((row) => {
    const s = mapSubmission(row);
    const camp = row.campaigns as {
      title?: string;
      view_bonus_per_1k?: number;
      max_payout_per_post?: number;
      rates?: Record<string, unknown> | null;
      min_views?: number | null;
      max_payout_per_creator?: number | null;
      budget_left?: number | null;
    } | null;
    s.campaign_title = camp?.title;
    // Single rate (P1-b): ONE rate per 1,000 views for the whole
    // campaign — rateForPlatform() returns the campaign's one
    // rate (view_bonus_per_1k) for every platform and ignores the
    // legacy per-platform `rates` map entirely. The old comment
    // here said "platform-specific rate", which was stale.
    const legacyRate = Number(camp?.view_bonus_per_1k ?? 0);
    s.rate_per_1k =
      rateForPlatform(
        { rates: ratesFromRow((camp ?? {}) as Record<string, unknown>), view_bonus_per_1k: legacyRate },
        s.platform
      ) || undefined;
    s.max_payout_per_post =
      Number(camp?.max_payout_per_post ?? 0) || undefined;
    s.campaign_min_views = camp?.min_views ?? null;
    s.campaign_max_payout_per_creator = camp?.max_payout_per_creator ?? null;
    s.campaign_budget_left =
      camp?.budget_left == null ? undefined : Number(camp.budget_left);
    const flag = flagMap.get(s.id);
    if (flag) {
      s.flag_reason = flag.reason;
      s.flagged_at = flag.flagged_at;
    }
    return s;
  });
}

/** All submissions, newest first — owner only. Paginated
 *  (default page size 100): the old .limit(200) with no paging
 *  silently dropped every submission past 200 from /admin review,
 *  including still-pending ones that could then never be
 *  approved or rejected. Pair with getSubmissionsCount() /
 *  getSubmissionStatusCounts() so the UI always shows the total
 *  and truncation is never silent. */
export async function getAllSubmissions(
  opts: { limit?: number; offset?: number } = {}
): Promise<Submission[]> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 100));
  const offset = Math.max(0, opts.offset ?? 0);
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("submissions")
    .select("*, campaigns(title, view_bonus_per_1k, max_payout_per_post, rates, min_views, max_payout_per_creator, budget_left)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns).
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load submissions.");
  return (data as Record<string, unknown>[]).map(mapSubmissionWithCampaign);
}

/** Shared row mapping for getAllSubmissions + getAllSubmissionsUnpaged:
 *  a submission row joined with its campaign's title, single rate,
 *  cap, min views and remaining budget. */
function mapSubmissionWithCampaign(row: Record<string, unknown>): Submission {
  const s = mapSubmission(row);
  const camp = row.campaigns as {
    title?: string;
    view_bonus_per_1k?: number;
    max_payout_per_post?: number;
    rates?: Record<string, unknown> | null;
    min_views?: number | null;
    max_payout_per_creator?: number | null;
    budget_left?: number | null;
  } | null;
  s.campaign_title = camp?.title;
  // Single rate (P1-b): ONE rate per 1,000 views for the whole
  // campaign — rateForPlatform() returns the campaign's one
  // rate (view_bonus_per_1k) for every platform and ignores the
  // legacy per-platform `rates` map entirely. The old comment
  // here said "platform-specific rate", which was stale.
  const legacyRate = Number(camp?.view_bonus_per_1k ?? 0);
  s.rate_per_1k =
    rateForPlatform(
      { rates: ratesFromRow((camp ?? {}) as Record<string, unknown>), view_bonus_per_1k: legacyRate },
      s.platform
    ) || undefined;
  s.max_payout_per_post =
    Number(camp?.max_payout_per_post ?? 0) || undefined;
  s.campaign_min_views = camp?.min_views ?? null;
  s.campaign_max_payout_per_creator = camp?.max_payout_per_creator ?? null;
  s.campaign_budget_left =
    camp?.budget_left == null ? undefined : Number(camp.budget_left);
  return s;
}

/**
 * All submissions, newest first — owner only, NO pagination. For
 * the /admin derived sections (Payouts, Creators, post-end
 * re-check) only: those sections must see every submission, not
 * just the current review page, or approved earnings past page 1
 * would vanish from Payouts. The review list itself stays paged
 * (getAllSubmissions). Chunked to exhaustion in 1,000-row chunks
 * (Round-4 P1-A1) — the old unpaged select silently capped at
 * 1,000 rows, so past 1,000 submissions the OLDEST rows vanished
 * from Payouts, Creators and Re-check with no disclosure.
 * Throws on DB error, per the Forms #26 contract.
 */
export async function getAllSubmissionsUnpaged(): Promise<Submission[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const rows = await fetchAllPages(async (offset, chunk) => {
    const { data, error } = await supabase
      .from("submissions")
      .select("*, campaigns(title, view_bonus_per_1k, max_payout_per_post, rates, min_views, max_payout_per_creator, budget_left)")
      .order("created_at", { ascending: false })
      .range(offset, offset + chunk - 1);
    return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
  });
  return rows.map(mapSubmissionWithCampaign);
}

export async function getWallet(userId: string): Promise<Wallet | null> {
  const supabase = getServerClient();
  if (!supabase) return null;
  // Release any matured 72-hour holds first, so the balances below
  // are never stale (see releaseMaturedHolds).
  await releaseMaturedHolds();
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    user_id: String(row.user_id),
    available_balance: Number(row.available_balance ?? 0),
    pending_balance: Number(row.pending_balance ?? 0),
    withdrawn_total: Number(row.withdrawn_total ?? 0),
  };
}

/**
 * Release matured 72-hour holds into available balance.
 *
 * BUG FIX (found in audit): approved earnings were credited to
 * pending_balance by Admin Review, but NOTHING ever moved them to
 * available_balance — creators could never withdraw. The fix is a
 * SECURITY DEFINER function (migration 0011) that moves each approved
 * submission's earnings from pending to available once, the first
 * time its hold_until has passed. It is called lazily on every wallet
 * read, so no cron or service key is needed, and it can only move
 * money that is already due to its rightful owner. Until migration
 * 0011 runs, the RPC does not exist and this is a silent no-op.
 */
export async function releaseMaturedHolds(): Promise<void> {
  const supabase = getServerClient();
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc("release_matured_holds");
    if (error) {
      // Function missing (migration 0011 not run yet): approved
      // earnings would sit in Pending forever with nothing telling
      // anyone why. Log loudly instead of silently returning —
      // the server log is the only signal until the migration runs.
      console.error(
        "[releaseMaturedHolds] RPC failed — approved earnings may be stuck in Pending:",
        error.message
      );
      return;
    }
  } catch {
    return;
  }
}

function mapWithdrawal(row: Record<string, unknown>): Withdrawal {
  const mapped: Withdrawal = {
    id: String(row.id),
    user_id: String(row.user_id),
    amount: Number(row.amount ?? 0),
    fee: Number(row.fee ?? 0),
    final_amount: Number(row.final_amount ?? 0),
    method: String(row.method ?? ""),
    details: String(row.details ?? ""),
    status: String(row.status ?? "pending"),
    created_at: String(row.created_at ?? ""),
  };
  // Payout Transaction ID (migration 0040, Round-4 P1-A3): the
  // on-chain transfer that paid this withdrawal, recorded when
  // the owner marks it paid. The Withdrawal type in lib/types.ts
  // does not declare it yet, so it is attached here without a
  // type edit — the same pattern mapCampaign uses for
  // payment_tx_submitted_at. Null on rows marked paid before
  // 0040 (no TxID was ever recorded for them).
  (mapped as unknown as Record<string, unknown>).payout_tx_id =
    (row.payout_tx_id as string | null) ?? null;
  return mapped;
}

export async function getWithdrawals(userId: string): Promise<Withdrawal[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  // Round-6 sweep: chunked to exhaustion — the old unpaged
  // select silently capped at 1,000 rows, dropping a creator's
  // oldest withdrawals from their history.
  const rows = await fetchAllPages(async (offset, chunk) => {
    const { data, error } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + chunk - 1);
    return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
  });
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns). fetchAllPages already throws on DB error.
  return rows.map(mapWithdrawal);
}

/** All withdrawal requests, newest first — owner only. */
export async function getAllWithdrawals(): Promise<Withdrawal[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  // Chunked to exhaustion (Round-4 P1-A1, Round-5 P2) — the old
  // .limit(2000) silently dropped the oldest requests past 2,000
  // rows from /admin, the same truncation class as the review
  // limit it replaced.
  const rows = await fetchAllPages(async (offset, chunk) => {
    const { data, error } = await supabase
      .from("withdrawals")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + chunk - 1);
    return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
  });
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns).
  return rows.map(mapWithdrawal);
}

/**
 * Exact counts for the paginated /admin lists, so the UI can say
 * "showing X–Y of Z" and truncation is never silent. Head-only
 * queries (no rows fetched). All throw on DB error, per the
 * Forms #26 contract — a failed count is a failed load, not 0.
 */
export async function getSubmissionsCount(): Promise<number> {
  const supabase = getServerClient();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("submissions")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Exact submission counts by status, for the /admin summary
 *  boxes — computed from the whole table, not from the current
 *  review-list page, so the headline numbers stay right when the
 *  list is paged. */
export async function getSubmissionStatusCounts(): Promise<{
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}> {
  const supabase = getServerClient();
  if (!supabase) return { pending: 0, approved: 0, rejected: 0, total: 0 };
  const out = { pending: 0, approved: 0, rejected: 0, total: 0 };
  for (const status of ["pending", "approved", "rejected"] as const) {
    const { count, error } = await supabase
      .from("submissions")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
    if (error) throw new Error(error.message);
    out[status] = count ?? 0;
  }
  out.total = out.pending + out.approved + out.rejected;
  return out;
}

/** Exact count of all brand messages, for the /admin inbox
 *  "showing X–Y of Z". */
export async function getBrandMessagesCount(): Promise<number> {
  const supabase = getServerClient();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("brand_messages")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Exact count of unread brand messages, for the /admin inbox
 *  badge — computed from the whole table, not the current page. */
export async function getUnreadBrandMessagesCount(): Promise<number> {
  const supabase = getServerClient();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("brand_messages")
    .select("*", { count: "exact", head: true })
    .eq("is_read", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Exact count of 'bot views' rejection rows (all creators), for
 *  the fraud view — pairs with getCreatorBotRejections(), whose
 *  fetch is capped (see below), so the UI can say when rows were
 *  left out. */
export async function getBotRejectionRowCount(): Promise<number> {
  const supabase = getServerClient();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("submissions")
    .select("*", { count: "exact", head: true })
    .eq("status", "rejected")
    .eq("rejection_reason", "bot views");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * The admin's USDT (TRC20) wallet address brands send their campaign
 * budget to (migration 0013, site_settings key 'admin_usdt_wallet').
 * Public-read by RLS, so the brand payment page can show it. Returns
 * null when no address is saved yet, or when the migration has not
 * run yet (same silent no-op pattern as releaseMaturedHolds).
 */
export async function getAdminUsdtWallet(): Promise<string | null> {
  const supabase = getServerClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "admin_usdt_wallet")
      .single();
    if (error || !data) return null;
    const value = String(
      (data as Record<string, unknown>).value ?? ""
    ).trim();
    return value || null;
  } catch {
    return null;
  }
}

function mapBrandMessage(row: Record<string, unknown>): BrandMessage {
  const camp = row.campaigns as {
    title?: string;
    brand_name?: string;
    payment_tx_id?: string | null;
  } | null;
  return {
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    user_id: String(row.user_id),
    message: String(row.message ?? ""),
    proof_url: (row.proof_url as string | null) ?? null,
    // New in migration 0015; rows written before it fall back to a
    // plain brand text message.
    sender: row.sender === "admin" ? "admin" : "brand",
    message_type: row.message_type === "image" ? "image" : "text",
    image_path: (row.image_path as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    is_read: Boolean(row.is_read),
    // Brand-side read state (migration 0043, Round-5 P2) — only
    // present when the column was selected (getCampaignMessages
    // selects it; the admin inbox does not need it). Rows loaded
    // before 0043 leave it undefined; callers fall back to
    // is_read in that case.
    brand_read:
      typeof row.brand_read === "boolean" ? row.brand_read : undefined,
    campaign_title: camp?.title,
    brand_name: camp?.brand_name,
    payment_tx_id: camp?.payment_tx_id ?? null,
  };
}

/**
 * Prefix of the admin message written to a campaign's brand chat
 * when the campaign is rejected (see POST /api/admin/campaigns).
 * There is NO rejection_reason column on campaigns — the column
 * from migration 0020 lives on submissions only — and no new
 * migration may be added in this batch, so the brand chat thread
 * is the durable store for the reason (the admin insert policy
 * in migration 0015 allows the owner to write sender='admin'
 * messages), and getCampaignRejectionReason reads it back for
 * the brand dashboard and payment page. The reason is also
 * returned in the reject API response.
 */
export const CAMPAIGN_REJECTED_MESSAGE_PREFIX = "Campaign rejected:";

/** The rejection reason for a campaign, read back from its brand
 *  chat thread (latest admin "Campaign rejected: …" message).
 *  Returns null when the campaign was never rejected this way
 *  (e.g. rejected before this fix) or the chat cannot be read —
 *  callers show generic copy then, never a wrong reason. */
export async function getCampaignRejectionReason(
  campaignId: string
): Promise<string | null> {
  try {
    const messages = await getCampaignMessages(campaignId);
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (
        m.sender === "admin" &&
        m.message.startsWith(CAMPAIGN_REJECTED_MESSAGE_PREFIX)
      ) {
        return (
          m.message.slice(CAMPAIGN_REJECTED_MESSAGE_PREFIX.length).trim() ||
          null
        );
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Messages on one campaign, oldest first — for the payment-page
 * chat thread. RLS (migration 0015) lets a brand read every message
 * on its own campaigns (its own and the admin's replies) and the
 * owner read all, so the caller must own the campaign or be the
 * owner. Throws on DB error, per the Forms #26 contract (see
 * getCampaigns) — callers that can live without the chat catch it.
 */
export async function getCampaignMessages(
  campaignId: string
): Promise<BrandMessage[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  // brand_read (migration 0043, Round-5 P2) is the brand's own
  // read state — the chat form needs it to clear the dashboard
  // badge. Select it when the column exists; before 0043 is
  // applied the select errors (42703), so retry without it and
  // let callers fall back to is_read.
  const selectWithBrandRead =
    "id, campaign_id, user_id, message, proof_url, sender, message_type, image_path, created_at, is_read, brand_read";
  const selectLegacy =
    "id, campaign_id, user_id, message, proof_url, sender, message_type, image_path, created_at, is_read";
  // Round-6 B4: newest-first + .limit(200) + reverse, mirroring
  // the API chat route — the old ascending, unbounded select hit
  // PostgREST's 1,000-row cap and returned the OLDEST 1,000, so
  // on a long thread the newest admin replies (rejection reason,
  // "payment verified") silently vanished from the brand's main
  // chat surface. The returned order is still oldest-first.
  let data: Record<string, unknown>[] | null = null;
  let error: { message: string } | null = null;
  const first = await supabase
    .from("brand_messages")
    .select(selectWithBrandRead)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!first.error) {
    data = first.data as Record<string, unknown>[] | null;
  } else if (
    first.error.code === "42703" &&
    /brand_read/.test(first.error.message ?? "")
  ) {
    const retry = await supabase
      .from("brand_messages")
      .select(selectLegacy)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(200);
    data = retry.data as Record<string, unknown>[] | null;
    error = retry.error;
  } else {
    error = first.error;
  }
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns). Callers that can live without the chat
  // (payment page, rejection-reason lookup) catch it themselves.
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load messages.");
  return (data as Record<string, unknown>[])
    .slice()
    .reverse()
    .map(mapBrandMessage);
}

/**
 * Every brand message, newest first — owner only (admin inbox).
 * Joins the campaign so each message shows its campaign title,
 * brand name and submitted Transaction ID. Paginated (default
 * page size 100): the old .limit(200) with no paging silently
 * dropped the oldest brand threads from the admin inbox. Pair
 * with getBrandMessagesCount() so the UI always shows the total.
 */
export async function getBrandMessages(
  opts: { limit?: number; offset?: number } = {}
): Promise<BrandMessage[]> {
  const limit = Math.max(1, Math.min(500, opts.limit ?? 100));
  const offset = Math.max(0, opts.offset ?? 0);
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("brand_messages")
    .select(
      "id, campaign_id, user_id, message, proof_url, sender, message_type, image_path, created_at, is_read, campaigns(title, brand_name, payment_tx_id)"
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns).
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load brand messages.");
  return (data as Record<string, unknown>[]).map(mapBrandMessage);
}

/**
 * Every brand message, newest first — owner only, NO pagination.
 * For the /admin Proof/Chat flags only: those flags must see every
 * message, not just the current inbox page, or a proof sitting on
 * an older inbox page would show "Proof — none yet". The inbox
 * list itself stays paged (getBrandMessages). Throws on DB error,
 * per the Forms #26 contract.
 */
export async function getBrandMessagesUnpaged(): Promise<BrandMessage[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  // P1-A1: chunked to exhaustion (see fetchAllPages) — the old
  // unpaged select silently capped at 1,000 rows, so a proof on
  // an older inbox page showed "Proof — none yet".
  const rows = await fetchAllPages(async (offset, chunk) => {
    const { data, error } = await supabase
      .from("brand_messages")
      .select(
        "id, campaign_id, user_id, message, proof_url, sender, message_type, image_path, created_at, is_read, campaigns(title, brand_name, payment_tx_id)"
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + chunk - 1);
    return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
  });
  return rows.map(mapBrandMessage);
}

/**
 * Rejection reasons for a set of campaigns, read back from their
 * brand-chat threads in ONE chunked query (batched version of
 * getCampaignRejectionReason, for the /admin refund queue — one
 * query per campaign would be N+1). Returns the latest admin
 * "Campaign rejected: …" message per campaign, or no entry when
 * the campaign was never rejected that way. Throws on DB error,
 * per the Forms #26 contract.
 */
export async function getCampaignRejectionReasons(
  campaignIds: string[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (campaignIds.length === 0) return out;
  const supabase = getServerClient();
  if (!supabase) return out;
  const rows = await fetchAllPages(async (offset, chunk) => {
    const { data, error } = await supabase
      .from("brand_messages")
      .select("campaign_id, message, sender, created_at")
      .in("campaign_id", campaignIds)
      .eq("sender", "admin")
      .order("created_at", { ascending: false })
      .range(offset, offset + chunk - 1);
    return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
  });
  // Newest first, so the first matching message per campaign is
  // the latest rejection reason.
  for (const row of rows) {
    const campaignId = String(row.campaign_id ?? "");
    if (!campaignId || out[campaignId]) continue;
    const message = String(row.message ?? "");
    if (message.startsWith(CAMPAIGN_REJECTED_MESSAGE_PREFIX)) {
      const reason = message
        .slice(CAMPAIGN_REJECTED_MESSAGE_PREFIX.length)
        .trim();
      if (reason) out[campaignId] = reason;
    }
  }
  return out;
}

/** One row of the refund_requests table (migration 0041): a
 *  brand's request for its paid budget back after a campaign was
 *  rejected. `status` is 'requested' until the owner sends the
 *  refund and marks it 'sent'. `kind` (migration 0043, Round-5
 *  P2) is 'rejected' for a rejected campaign or 'overpayment'
 *  when the budget was lowered after payment — undefined on rows
 *  loaded before 0043, where the kind is derived from the
 *  campaign's status instead. */
export interface RefundRequest {
  id: string;
  campaign_id: string;
  user_id: string;
  amount: number;
  payment_tx_id: string | null;
  status: string;
  kind?: string;
  created_at: string;
}

/**
 * Open refund requests (status = 'requested'), newest first —
 * owner only, for the /admin refund queue (Round-4 P1-A2). The
 * table is consumed by the refund-request API route (another
 * workstream); this loader only reads the open queue. Chunked to
 * exhaustion (P1-A1). Throws on DB error, per the Forms #26
 * contract — a failed load is a failed load, never "no refunds
 * owed". Returns [] when migration 0041 has not been applied
 * yet (the table does not exist): the queue is empty, not broken.
 */
export async function getOpenRefundRequests(): Promise<RefundRequest[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  // Round-6 P1-1: only a missing table (42P01, pre-migration
  // 0041) means "no refunds can exist" and returns []. EVERY
  // other DB error is rethrown, so /admin renders AdminLoadError
  // (its try/catch already covers this loader) instead of an
  // honestly-empty-looking refund queue with a brand's money
  // invisible inside it. The old try/catch returned [] for any
  // error at all. fetchAllPages throws plain Errors carrying
  // only the PostgREST message, so the 42P01 check matches the
  // message text ("relation … does not exist") as well as the
  // code.
  const isTableMissing = (err: unknown): boolean => {
    const e = err as { code?: string; message?: string } | null;
    if (!e) return false;
    if (e.code === "42P01") return true;
    return /relation .* does not exist/i.test(e.message ?? "");
  };
  let rows: Record<string, unknown>[];
  try {
    rows = await fetchAllPages(async (offset, chunk) => {
      const { data, error } = await supabase
        .from("refund_requests")
        .select("id, campaign_id, user_id, amount, payment_tx_id, status, created_at")
        .eq("status", "requested")
        .order("created_at", { ascending: false })
        .range(offset, offset + chunk - 1);
      return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
    });
  } catch (err) {
    if (isTableMissing(err)) return [];
    throw err;
  }
  const mapped = rows.map((row) => ({
    id: String(row.id),
    campaign_id: String(row.campaign_id),
    user_id: String(row.user_id),
    amount: Number(row.amount ?? 0),
    payment_tx_id: (row.payment_tx_id as string | null) ?? null,
    status: String(row.status ?? "requested"),
    created_at: String(row.created_at ?? ""),
  }));
  // kind (migration 0043, Round-5 P2) — best-effort second
  // read: selecting it in the main query would break the whole
  // queue before 0043 is applied (42703), and the loader's
  // catch-all would then hide every open refund. When the
  // column is missing, kind stays undefined and the admin
  // queue derives it from the campaign's status instead.
  // Round-6 A7: paged with fetchAllPages like the main query —
  // the old unpaged select silently capped at 1,000 rows, so
  // open refunds past 1,000 lost their kind. A failure here
  // (missing column pre-0043, transient error) still only
  // drops kinds, never the queue itself.
  try {
    const kindRows = await fetchAllPages(async (offset, chunk) => {
      const { data, error } = await supabase
        .from("refund_requests")
        .select("id, kind")
        .eq("status", "requested")
        .range(offset, offset + chunk - 1);
      return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
    });
    const kindById = new Map(
      kindRows.map((r) => [String(r.id), String(r.kind ?? "")])
    );
    for (const row of mapped) {
      const kind = kindById.get(row.id);
      if (kind) (row as RefundRequest).kind = kind;
    }
  } catch {
    // Kinds unavailable — the queue above is still complete.
  }
  return mapped;
}

/** One row of the public.users directory (Round-4 P2-A12): the
 *  fields the /admin Users section lists. Owner-only. */
export interface AdminUserRow {
  id: string;
  email: string;
  role: string;
  is_admin: boolean;
  is_blocked: boolean;
  instagram_url: string | null;
  created_at: string;
}

/**
 * Every user, oldest first — owner only, for the /admin Users
 * directory and for joining creator emails / blocked state /
 * Instagram links. Chunked to exhaustion in 1,000-row chunks
 * (Round-4 P1-A1): the old inline select in admin/page.tsx had
 * no limit and silently capped at 1,000 users, so past 1,000
 * users creator emails fell back to a user-id fragment,
 * manually-blocked creators disappeared from the Fraud view's
 * Banned section, and Instagram hand-check links went missing.
 * Throws on DB error, per the Forms #26 contract.
 */
export async function getAllUsers(): Promise<AdminUserRow[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const rows = await fetchAllPages(async (offset, chunk) => {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, role, is_admin, is_blocked, instagram_url, created_at")
      .order("created_at", { ascending: true })
      .range(offset, offset + chunk - 1);
    return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
  });
  return rows.map((row) => ({
    id: String(row.id),
    email: String(row.email ?? ""),
    role: String(row.role ?? "creator"),
    is_admin: Boolean(row.is_admin),
    is_blocked: Boolean(row.is_blocked),
    instagram_url: (row.instagram_url as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
  }));
}

/** Best-effort storage usage for one bucket (Round-4 P2-A9c).
 *  `capped` means the scan stopped at MAX_FILES_SCANNED files —
 *  the real totals may be higher. `error` is set (and the counts
 *  are 0) when the bucket could not be listed at all. */
export interface StorageUsage {
  bucket: string;
  folders: number;
  files: number;
  bytes: number;
  capped: boolean;
  error: string | null;
}

/**
 * Per-bucket file count + size for /admin, best-effort and cheap:
 * lists the top-level folders, then one bounded file list per
 * folder (objects live at <user_id>/… in campaign-images and
 * <campaign_id>/… in brand-proofs). Never throws — a failure
 * returns an entry with `error` set, so the admin page renders
 * "unavailable" instead of breaking. The scan stops at 500 files
 * per bucket; totals past that are reported as capped, never as
 * a fake exact number.
 */
export async function getStorageUsage(): Promise<StorageUsage[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const MAX_FILES_SCANNED = 500;
  const out: StorageUsage[] = [];
  for (const bucket of ["campaign-images", "brand-proofs"]) {
    const usage: StorageUsage = {
      bucket,
      folders: 0,
      files: 0,
      bytes: 0,
      capped: false,
      error: null,
    };
    try {
      const { data: top, error: topError } = await supabase.storage
        .from(bucket)
        .list("", { limit: 1000 });
      if (topError || !top) {
        throw new Error(topError?.message ?? "Could not list bucket.");
      }
      for (const entry of top) {
        if (usage.files >= MAX_FILES_SCANNED) {
          usage.capped = true;
          break;
        }
        // Folder entries carry no metadata; file entries carry
        // metadata.size. A top-level file is counted directly.
        const meta = entry.metadata as { size?: number } | null;
        if (meta && typeof meta.size === "number") {
          usage.files += 1;
          usage.bytes += meta.size;
          continue;
        }
        if (!entry.name) continue;
        usage.folders += 1;
        const { data: files, error: filesError } = await supabase.storage
          .from(bucket)
          .list(entry.name, { limit: 1000 });
        if (filesError || !files) continue;
        for (const f of files) {
          if (usage.files >= MAX_FILES_SCANNED) {
            usage.capped = true;
            break;
          }
          const fMeta = f.metadata as { size?: number } | null;
          usage.files += 1;
          usage.bytes +=
            fMeta && typeof fMeta.size === "number" ? fMeta.size : 0;
        }
      }
    } catch (err) {
      usage.error =
        err instanceof Error ? err.message : "Could not list bucket.";
    }
    out.push(usage);
  }
  return out;
}

/**
 * Fraud watch (P1-c, admin-only): creators with bot-view
 * rejections, counted LIVE from the submissions table — the
 * submissions table is the single source of truth for the count,
 * so this can never drift from what the review route stored.
 * One row per creator with at least one 'bot views' rejection,
 * newest bot rejection first, with the latest rejection's
 * campaign, link and date. The caller joins emails / blocked
 * state from the users table.
 *
 * Ladder reset (migration 0027): only bot rejections AFTER a
 * creator's creator_flags.unblocked_at count toward
 * bot_rejections, so an unblocked creator restarts at 0. The
 * `latest` rejection is still the newest one overall — rejections
 * from before the unblock stay visible as history, they just no
 * longer count toward a re-ban.
 */
export interface CreatorBotRejections {
  user_id: string;
  bot_rejections: number;
  latest: {
    campaign_id: string;
    campaign_title: string | null;
    post_url: string;
    created_at: string;
  } | null;
}

export async function getCreatorBotRejections(
  opts: { limit?: number; offset?: number } = {}
): Promise<CreatorBotRejections[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  // Unblock timestamps (migration 0027), best-effort and in its
  // own query so the counts below still work if 0027 has not
  // been applied yet (no unblocked_at column) — then every
  // rejection counts, as before.
  const unblockedAtById = new Map<string, string>();
  try {
    // Round-6 sweep: chunked to exhaustion — the old unpaged
    // select silently capped at 1,000 rows, so an unblock past
    // 1,000 flag rows never applied to the ladder counts below.
    const unblocked = await fetchAllPages(async (offset, chunk) => {
      const { data, error } = await supabase
        .from("creator_flags")
        .select("user_id, unblocked_at")
        .range(offset, offset + chunk - 1);
      return { rows: (data ?? null) as Record<string, unknown>[] | null, error };
    });
    for (const row of unblocked) {
      const userId = String(row.user_id ?? "");
      if (userId && row.unblocked_at) {
        unblockedAtById.set(userId, String(row.unblocked_at));
      }
    }
  } catch {
    // Migration 0027 not run yet — no ladder reset to apply.
  }

  // Paged like the review list / inbox (page size 100): the
  // paging applies to the CREATORS below, not to the raw rows —
  // a creator's rows must all be seen to count them, so slicing
  // the raw query would undercount anyone straddling the page
  // boundary. The raw rows are therefore fetched in 1,000-row
  // chunks until exhausted (no .limit(2000) cap any more: the
  // old cap silently dropped the oldest bot-rejection rows past
  // 2,000, and with them whole creators), aggregated, sorted,
  // and only then sliced to the requested creator page. Counts
  // stay exact: getBotRejectionRowCount() is the row total.
  const allRows: Record<string, unknown>[] = [];
  const CHUNK = 1000;
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await supabase
      .from("submissions")
      .select("user_id, campaign_id, post_url, created_at, campaigns(title)")
      .eq("status", "rejected")
      .eq("rejection_reason", "bot views")
      .order("created_at", { ascending: false })
      .range(offset, offset + CHUNK - 1);
    // Forms #26 contract: throw on DB error, never [] (see
    // getCampaigns).
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Could not load bot rejections.");
    allRows.push(...(data as Record<string, unknown>[]));
    if (data.length < CHUNK) break;
  }
  const byUser = new Map<string, CreatorBotRejections>();
  for (const row of allRows) {
    const userId = String(row.user_id ?? "");
    if (!userId) continue;
    const createdAt = String(row.created_at ?? "");
    // Counts toward the ladder only when it happened after the
    // creator's last unblock (no unblock → everything counts).
    const unblockedAt = unblockedAtById.get(userId);
    const countsTowardLadder =
      !unblockedAt ||
      new Date(createdAt).getTime() > new Date(unblockedAt).getTime();
    const camp = row.campaigns as { title?: string } | null;
    const entry = byUser.get(userId);
    if (entry) {
      if (countsTowardLadder) entry.bot_rejections += 1;
    } else {
      byUser.set(userId, {
        user_id: userId,
        bot_rejections: countsTowardLadder ? 1 : 0,
        latest: {
          campaign_id: String(row.campaign_id ?? ""),
          campaign_title: camp?.title ?? null,
          post_url: String(row.post_url ?? ""),
          created_at: createdAt,
        },
      });
    }
  }
  const creators = [...byUser.values()].sort(
    (a, b) => b.bot_rejections - a.bot_rejections
  );
  // No limit passed (the admin page before it wires fraudPage):
  // return every creator, as before. With a limit, slice to the
  // requested creator page — page size 100, like review/inbox.
  if (opts.limit === undefined) return creators;
  const limit = Math.max(1, Math.min(500, opts.limit));
  const start = Math.max(0, opts.offset ?? 0);
  return creators.slice(start, start + limit);
}

/**
 * Flag state from creator_flags (migration 0026): when a creator
 * was flagged / auto-banned, and when they were last unblocked
 * (migration 0027 — unblocked_at drives the "Previously banned"
 * note in the fraud view). The review route keeps this updated;
 * the COUNT itself is read live from submissions (above). Returns
 * {} when the migration has not run yet — the fraud view still
 * works from the live counts, it just has no flagged/banned dates.
 * unblocked_at is read in its own best-effort query so the flag
 * dates still load if migration 0027 has not been applied yet.
 */
export interface CreatorFlag {
  user_id: string;
  bot_rejections: number;
  flagged_at: string | null;
  banned_at: string | null;
  unblocked_at: string | null;
  /** Why the owner last unblocked this creator (migration 0043,
   *  Round-5 P1) — null when never unblocked, or when 0043 has
   *  not been applied yet and no reason was recorded. */
  unblock_reason?: string | null;
}

export async function getCreatorFlags(): Promise<
  Record<string, CreatorFlag>
> {
  const supabase = getServerClient();
  if (!supabase) return {};
  // Round-6 sweep: chunked to exhaustion — the old unpaged
  // select silently capped at 1,000 rows, so flag rows past
  // 1,000 vanished from the fraud view.
  const data = await fetchAllPages(async (offset, chunk) => {
    const { data: page, error } = await supabase
      .from("creator_flags")
      .select("user_id, bot_rejections, flagged_at, banned_at")
      .range(offset, offset + chunk - 1);
    return { rows: (page ?? null) as Record<string, unknown>[] | null, error };
  });
  // Forms #26 contract: throw on DB error, never {} (see
  // getCampaigns) — a failed flag load is a failed load, not
  // "no flags". fetchAllPages already throws on DB error.
  const out: Record<string, CreatorFlag> = {};
  for (const row of data) {
    const userId = String(row.user_id ?? "");
    if (!userId) continue;
    out[userId] = {
      user_id: userId,
      bot_rejections: Number(row.bot_rejections ?? 0),
      flagged_at: (row.flagged_at as string | null) ?? null,
      banned_at: (row.banned_at as string | null) ?? null,
      unblocked_at: null,
    };
  }
  try {
    const unblocked = await fetchAllPages(async (offset, chunk) => {
      const { data: page, error } = await supabase
        .from("creator_flags")
        .select("user_id, unblocked_at")
        .range(offset, offset + chunk - 1);
      return { rows: (page ?? null) as Record<string, unknown>[] | null, error };
    });
    for (const row of unblocked) {
      const userId = String(row.user_id ?? "");
      if (userId && out[userId]) {
        out[userId].unblocked_at =
          (row.unblocked_at as string | null) ?? null;
      }
    }
  } catch {
    // Migration 0027 not run yet — no unblocked_at to carry.
  }
  // Unblock reason (migration 0043, Round-5 P1) — its own
  // best-effort read, same pattern as unblocked_at: selecting it
  // in the main query would break the whole flag load before
  // 0043 is applied, and a failed reason read must not hide the
  // flagged/banned dates either. Chunked like the reads above
  // (Round-6 sweep).
  try {
    const reasons = await fetchAllPages(async (offset, chunk) => {
      const { data: page, error: reasonsError } = await supabase
        .from("creator_flags")
        .select("user_id, unblock_reason")
        .range(offset, offset + chunk - 1);
      return { rows: (page ?? null) as Record<string, unknown>[] | null, error: reasonsError };
    });
    for (const row of reasons) {
      const userId = String(row.user_id ?? "");
      if (userId && out[userId]) {
        out[userId].unblock_reason =
          (row.unblock_reason as string | null) ?? null;
      }
    }
  } catch {
    // Migration 0043 not run yet — no unblock reason to carry.
  }
  return out;
}

/** One active flag per submission (admin batch 2, migration 0031):
 *  reason + when it was flagged. Throws on DB error, per the
 *  Forms #26 contract (see getCampaigns). */
export type SubmissionFlag = { reason: string; flagged_at: string };

export async function getSubmissionFlags(): Promise<
  Record<string, SubmissionFlag>
> {
  const supabase = getServerClient();
  if (!supabase) return {};
  // Round-6 sweep: chunked to exhaustion — the old unpaged
  // select silently capped at 1,000 rows, so active flags past
  // 1,000 vanished from /admin.
  const data = await fetchAllPages(async (offset, chunk) => {
    const { data: page, error } = await supabase
      .from("submission_flags")
      .select("submission_id, reason, created_at")
      .is("resolved_at", null)
      .range(offset, offset + chunk - 1);
    return { rows: (page ?? null) as Record<string, unknown>[] | null, error };
  });
  // fetchAllPages already throws on DB error, per the Forms #26
  // contract (see getCampaigns).
  const out: Record<string, SubmissionFlag> = {};
  for (const row of data as {
    submission_id: string;
    reason: string;
    created_at: string;
  }[]) {
    out[row.submission_id] = {
      reason: row.reason,
      flagged_at: row.created_at,
    };
  }
  return out;
}

/** One row of the campaign budget edit trail (migration 0033):
 *  what the owner changed a campaign's budget from/to, why, and
 *  when. Newest first per campaign. */
export interface BudgetHistoryEntry {
  campaign_id: string;
  old_budget_total: number;
  new_budget_total: number;
  old_budget_left: number;
  new_budget_left: number;
  reason: string;
  created_at: string;
}

/** Budget edit history for a set of campaigns (admin campaign
 *  cards). Capped PER campaign — the 50 most recent edits each
 *  (Round-4 P2-A4). The old shared .limit(200) across ALL
 *  campaigns meant that once total edits passed 200, older
 *  campaigns' edits fell out of the newest-200 and their cards
 *  falsely claimed "No budget edits yet", hiding the audit trail
 *  the approve guard depends on. A campaign with no edits still
 *  gets an empty list. Throws on DB error, per the Forms #26
 *  contract (see getCampaigns). */
export async function getCampaignBudgetHistory(
  campaignIds: string[]
): Promise<Record<string, BudgetHistoryEntry[]>> {
  if (campaignIds.length === 0) return {};
  const supabase = getServerClient();
  if (!supabase) return {};
  const PER_CAMPAIGN_LIMIT = 50;
  const out: Record<string, BudgetHistoryEntry[]> = {};
  const results = await Promise.all(
    campaignIds.map(async (campaignId) => {
      const { data, error } = await supabase
        .from("campaign_budget_history")
        .select(
          "campaign_id, old_budget_total, new_budget_total, old_budget_left, new_budget_left, reason, created_at"
        )
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(PER_CAMPAIGN_LIMIT);
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Could not load budget history.");
      return { campaignId, rows: data as Record<string, unknown>[] };
    })
  );
  for (const { campaignId, rows } of results) {
    out[campaignId] = rows.map((row) => ({
      campaign_id: campaignId,
      old_budget_total: Number(row.old_budget_total ?? 0),
      new_budget_total: Number(row.new_budget_total ?? 0),
      old_budget_left: Number(row.old_budget_left ?? 0),
      new_budget_left: Number(row.new_budget_left ?? 0),
      reason: String(row.reason ?? ""),
      created_at: String(row.created_at ?? ""),
    }));
  }
  return out;
}

/**
 * The budget a payment covered (Round-4 P1-B2 / P2-B1 logic, now
 * shared by the overpayment refund route and the brand
 * dashboard): the old_budget_total of the EARLIEST edit made
 * AFTER the payment was submitted — history rows arrive
 * newest-first, and the payment time is payment_tx_submitted_at
 * (migration 0038; a legacy TxID row with no timestamp falls
 * back to the campaign's creation date, the same fallback the
 * expiry rule uses). An edit made BEFORE the brand paid trips
 * nothing: the brand paid the new budget. Returns null when no
 * post-payment edit exists — the payment covered the current
 * budget, so nothing was overpaid.
 */
export function paidBudgetCoveredByPayment(
  history: BudgetHistoryEntry[],
  paymentTxSubmittedAt: string | null | undefined,
  createdAt: string | null | undefined
): number | null {
  const paymentTimeMs = Number.isFinite(
    new Date(paymentTxSubmittedAt ?? createdAt ?? "").getTime()
  )
    ? new Date(paymentTxSubmittedAt ?? createdAt ?? "").getTime()
    : 0;
  const postPaymentEdits = history.filter(
    (h) => new Date(h.created_at).getTime() > paymentTimeMs
  );
  if (postPaymentEdits.length === 0) return null;
  const earliest = postPaymentEdits[postPaymentEdits.length - 1];
  return Number(earliest.old_budget_total ?? 0);
}

/** One row of the Win Board (Top Clippers): a creator's real
 *  earnings from approved clips only. There is deliberately NO
 *  user_id here — the public leaderboard RPC (migration 0036)
 *  returns aggregates only (display name, earnings, clip count,
 *  views), never user ids, wallet data, or emails. */
export interface TopClipperEntry {
  name: string;
  earned: number;
  views: number;
  clips: number;
}

/**
 * Top earners from APPROVED submissions, across all campaigns
 * (global board) or one campaign (campaign board). Names come
 * from the creator's own profile full_name; a missing name falls
 * back to "Creator".
 *
 * Public board (migration 0036, Money P0-1): the rows come from
 * the SECURITY DEFINER RPC get_public_leaderboard, which returns
 * ONLY aggregate rows, so the board is real for every visitor —
 * not just the owner. The old is_admin gate (which made the board
 * show $0.00 / "nobody has earned anything" to every non-admin
 * forever) is gone. Until 0036 is applied the RPC does not exist
 * and this returns null — the board then shows "unavailable",
 * never a fake zero (see WinBoard). An RPC error is also null,
 * never []: [] means "no winners", and a failed load must not
 * render as the genuine zero state.
 */
async function topClippersFromRows(
  campaignId: string | null,
  limit: number
): Promise<TopClipperEntry[] | null> {
  try {
    const supabase = getServerClient();
    if (!supabase) return null;
    const { data: rows, error } = await supabase.rpc(
      "get_public_leaderboard",
      { p_campaign_id: campaignId }
    );
    if (error || !rows) return null;
    return (rows as Record<string, unknown>[])
      .map((r) => ({
        name: String(r.display_name ?? "").trim() || "Creator",
        earned: Math.round(Number(r.total_earned ?? 0) * 100) / 100,
        views: Number(r.total_views ?? 0),
        clips: Number(r.approved_clips ?? 0),
      }))
      .sort((a, b) => b.earned - a.earned || b.views - a.views)
      .slice(0, Math.max(1, limit));
  } catch {
    return null;
  }
}

/** Top earners across all campaigns (Discover board). Null when
 *  the leaderboard could not be loaded — callers must show
 *  "unavailable", never a fake zero. */
export async function getTopClippers(
  limit = 5
): Promise<TopClipperEntry[] | null> {
  return topClippersFromRows(null, limit);
}

/** Top earners on one campaign (campaign detail board). Null
 *  when the leaderboard could not be loaded. */
export async function getCampaignTopClippers(
  campaignId: string,
  limit = 5
): Promise<TopClipperEntry[] | null> {
  return topClippersFromRows(campaignId, limit);
}

/**
 * Total paid out so far — sum of final_amount over withdrawals
 * the owner marked "paid" (migration 0036, get_total_paid_out).
 * Returns null when the RPC is unavailable (migration not applied
 * yet, or a database error) so the board never prints a fake
 * $0.00; callers must hide the total line instead of guessing.
 */
export async function getTotalPaidOut(): Promise<number | null> {
  try {
    const supabase = getServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("get_total_paid_out");
    if (error || data === null || data === undefined) return null;
    const total = Number(data);
    return Number.isFinite(total) ? Math.round(total * 100) / 100 : null;
  } catch {
    return null;
  }
}
