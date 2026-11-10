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
  return {
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
}

function mapSubmission(row: Record<string, unknown>): Submission {
  return {
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
    how_made: String(row.how_made ?? ""),
    proof_screenshots: Array.isArray(row.proof_screenshots)
      ? (row.proof_screenshots as string[])
      : [],
    is_duplicate: Boolean(row.is_duplicate),
    created_at: String(row.created_at ?? ""),
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

// Live / settling definitions live in src/lib/campaigns.ts (pure,
// client-safe) and are re-exported here so existing server imports
// (`from "@/lib/data"`) keep working.
export { isCampaignLive, isCampaignSettling, campaignStatus } from "./campaigns";
import { isCampaignLive } from "./campaigns";

/**
 * 7-day expiry for unpaid pending campaigns — the SAME rule as
 * migration 0030's campaign_expired_unpaid_pending() predicate,
 * so the API routes and the daily cron can never drift apart:
 * status = 'pending' AND no payment_tx_id (null or empty — chat
 * messages and screenshots do NOT count as payment) AND
 * created_at is 7 or more days old. "Unpaid" means NO TxID, not
 * "not is_funded": is_funded only becomes true at approve time,
 * so a campaign with a submitted TxID is paid for expiry
 * purposes even while it is still pending approval.
 */
export const UNPAID_PENDING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function isExpiredUnpaidPending(campaign: {
  status?: string | null;
  payment_tx_id?: string | null;
  created_at?: string | null;
}): boolean {
  if (campaign.status !== "pending") return false;
  if (String(campaign.payment_tx_id ?? "").trim()) return false;
  const created = campaign.created_at
    ? new Date(campaign.created_at).getTime()
    : NaN;
  if (!Number.isFinite(created)) return false;
  return Date.now() - created >= UNPAID_PENDING_EXPIRY_MS;
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
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("is_funded", true)
      .eq("status", "live")
      .order("created_at", { ascending: false });
    // Forms #26 contract: a database error THROWS instead of
    // returning [] — [] means "no live campaigns", never "the
    // load failed". Callers render an honest error state.
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Could not load campaigns.");
    const now = Date.now();
    return (data as Record<string, unknown>[])
      .map(mapCampaign)
      .filter((c) => isCampaignLive(c, now));
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
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("is_funded", true)
      .eq("status", "live")
      .order("created_at", { ascending: false });
    // Forms #26 contract: throw on DB error, never [] (see
    // getCampaigns).
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Could not load campaigns.");
    return (data as Record<string, unknown>[]).map(mapCampaign);
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
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns).
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load pending campaigns.");
  return (data as Record<string, unknown>[]).map(mapCampaign);
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
    .order("created_at", { ascending: false });
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
    const { data, error } = await supabase
      .from("submissions")
      .select("views")
      .eq("campaign_id", campaignId)
      .eq("status", "approved");
    if (!error && data) {
      const rows = data as Record<string, unknown>[];
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
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return null;
  const { data: rows, error: qError } = await supabase
    .from("submissions")
    .select("user_id, status, created_at, views")
    .eq("campaign_id", campaignId);
  if (qError || !rows) return null;
  const list = rows as Record<string, unknown>[];
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
  const out: Record<string, CampaignStats | null> = {};
  for (const id of campaignIds) {
    out[id] = await getCampaignStats(id);
  }
  return out;
}

/** A creator's submissions, newest first. Empty when Supabase is not set up. */
export async function getUserSubmissions(userId: string): Promise<Submission[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("submissions")
    .select("*, campaigns(title, view_bonus_per_1k, max_payout_per_post, rates, min_views, max_payout_per_creator, budget_left)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns).
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load your submissions.");
  const rows = data as Record<string, unknown>[];
  // Active flags (migration 0031): a flagged payout is paused, and
  // the creator must see that on My Posts — the old code fetched
  // submissions only, so a flagged clip looked like an ordinary
  // "Under Review" with no hint anything was paused.
  const flagMap = new Map<string, { reason: string; flagged_at: string }>();
  if (rows.length > 0) {
    try {
      const { data: flags } = await supabase
        .from("submission_flags")
        .select("submission_id, reason, created_at")
        .in(
          "submission_id",
          rows.map((r) => String(r.id))
        )
        .is("resolved_at", null);
      for (const f of (flags ?? []) as Record<string, unknown>[]) {
        flagMap.set(String(f.submission_id), {
          reason: String(f.reason ?? ""),
          flagged_at: String(f.created_at ?? ""),
        });
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
 * (getAllSubmissions). Admin-only page, submissions grow slowly.
 * Throws on DB error, per the Forms #26 contract.
 */
export async function getAllSubmissionsUnpaged(): Promise<Submission[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("submissions")
    .select("*, campaigns(title, view_bonus_per_1k, max_payout_per_post, rates, min_views, max_payout_per_creator, budget_left)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load submissions.");
  return (data as Record<string, unknown>[]).map(mapSubmissionWithCampaign);
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
  return {
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
}

export async function getWithdrawals(userId: string): Promise<Withdrawal[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns).
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load withdrawals.");
  return (data as Record<string, unknown>[]).map(mapWithdrawal);
}

/** All withdrawal requests, newest first — owner only. */
export async function getAllWithdrawals(): Promise<Withdrawal[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("withdrawals")
    .select("*")
    .order("created_at", { ascending: false })
    // Same truncation class as the old review limit (P1-7): past
    // 2,000 the oldest requests would vanish from /admin. The
    // admin Withdrawals section shows the whole list, so keep the
    // cap high; withdrawals grow slowly (one row per request).
    .limit(2000);
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns).
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load withdrawals.");
  return (data as Record<string, unknown>[]).map(mapWithdrawal);
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
  const { data, error } = await supabase
    .from("brand_messages")
    .select(
      "id, campaign_id, user_id, message, proof_url, sender, message_type, image_path, created_at, is_read"
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  // Forms #26 contract: throw on DB error, never [] (see
  // getCampaigns). Callers that can live without the chat
  // (payment page, rejection-reason lookup) catch it themselves.
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load messages.");
  return (data as Record<string, unknown>[]).map(mapBrandMessage);
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
  const { data, error } = await supabase
    .from("brand_messages")
    .select(
      "id, campaign_id, user_id, message, proof_url, sender, message_type, image_path, created_at, is_read, campaigns(title, brand_name, payment_tx_id)"
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load brand messages.");
  return (data as Record<string, unknown>[]).map(mapBrandMessage);
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

export async function getCreatorBotRejections(): Promise<
  CreatorBotRejections[]
> {
  const supabase = getServerClient();
  if (!supabase) return [];
  // Unblock timestamps (migration 0027), best-effort and in its
  // own query so the counts below still work if 0027 has not
  // been applied yet (no unblocked_at column) — then every
  // rejection counts, as before.
  const unblockedAtById = new Map<string, string>();
  try {
    const { data: unblocked } = await supabase
      .from("creator_flags")
      .select("user_id, unblocked_at");
    for (const row of (unblocked ?? []) as Record<string, unknown>[]) {
      const userId = String(row.user_id ?? "");
      if (userId && row.unblocked_at) {
        unblockedAtById.set(userId, String(row.unblocked_at));
      }
    }
  } catch {
    // Migration 0027 not run yet — no ladder reset to apply.
  }

    const { data, error } = await supabase
      .from("submissions")
      .select("user_id, campaign_id, post_url, created_at, campaigns(title)")
      .eq("status", "rejected")
      .eq("rejection_reason", "bot views")
      .order("created_at", { ascending: false })
      // P2-12: the old .limit(500) silently dropped creators past
      // 500 bot-rejection rows. Raised to 2,000 and paired with
      // getBotRejectionRowCount() — the fraud view shows the total
      // and says when rows were left out instead of truncating
      // silently.
      .limit(2000);
    // Forms #26 contract: throw on DB error, never [] (see
    // getCampaigns).
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Could not load bot rejections.");
    const byUser = new Map<string, CreatorBotRejections>();
    for (const row of data as Record<string, unknown>[]) {
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
    return [...byUser.values()].sort(
      (a, b) => b.bot_rejections - a.bot_rejections
    );
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
}

export async function getCreatorFlags(): Promise<
  Record<string, CreatorFlag>
> {
  const supabase = getServerClient();
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("creator_flags")
    .select("user_id, bot_rejections, flagged_at, banned_at");
  // Forms #26 contract: throw on DB error, never {} (see
  // getCampaigns) — a failed flag load is a failed load, not
  // "no flags".
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load creator flags.");
  const out: Record<string, CreatorFlag> = {};
  for (const row of data as Record<string, unknown>[]) {
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
    const { data: unblocked } = await supabase
      .from("creator_flags")
      .select("user_id, unblocked_at");
    for (const row of (unblocked ?? []) as Record<string, unknown>[]) {
      const userId = String(row.user_id ?? "");
      if (userId && out[userId]) {
        out[userId].unblocked_at =
          (row.unblocked_at as string | null) ?? null;
      }
    }
  } catch {
    // Migration 0027 not run yet — no unblocked_at to carry.
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
  const { data, error } = await supabase
    .from("submission_flags")
    .select("submission_id, reason, created_at")
    .is("resolved_at", null);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load submission flags.");
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
 *  cards). Throws on DB error, per the Forms #26 contract (see
 *  getCampaigns). */
export async function getCampaignBudgetHistory(
  campaignIds: string[]
): Promise<Record<string, BudgetHistoryEntry[]>> {
  if (campaignIds.length === 0) return {};
  const supabase = getServerClient();
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("campaign_budget_history")
    .select(
      "campaign_id, old_budget_total, new_budget_total, old_budget_left, new_budget_left, reason, created_at"
    )
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Could not load budget history.");
  const out: Record<string, BudgetHistoryEntry[]> = {};
  for (const row of data as Record<string, unknown>[]) {
    const campaignId = String(row.campaign_id ?? "");
    if (!campaignId) continue;
    const list = out[campaignId] ?? [];
    list.push({
      campaign_id: campaignId,
      old_budget_total: Number(row.old_budget_total ?? 0),
      new_budget_total: Number(row.new_budget_total ?? 0),
      old_budget_left: Number(row.old_budget_left ?? 0),
      new_budget_left: Number(row.new_budget_left ?? 0),
      reason: String(row.reason ?? ""),
      created_at: String(row.created_at ?? ""),
    });
    out[campaignId] = list;
  }
  return out;
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
 * and this returns [] — the board then shows "unavailable", never
 * a fake zero (see WinBoard).
 */
async function topClippersFromRows(
  campaignId: string | null,
  limit: number
): Promise<TopClipperEntry[]> {
  try {
    const supabase = getServerClient();
    if (!supabase) return [];
    const { data: rows, error } = await supabase.rpc(
      "get_public_leaderboard",
      { p_campaign_id: campaignId }
    );
    if (error || !rows) return [];
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
    return [];
  }
}

/** Top earners across all campaigns (Discover board). */
export async function getTopClippers(
  limit = 5
): Promise<TopClipperEntry[]> {
  return topClippersFromRows(null, limit);
}

/** Top earners on one campaign (campaign detail board). */
export async function getCampaignTopClippers(
  campaignId: string,
  limit = 5
): Promise<TopClipperEntry[]> {
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
