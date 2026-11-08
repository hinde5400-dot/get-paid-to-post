import { getServerClient } from "./supabase/server";
import type { BrandMessage, Campaign, Submission, Wallet, Withdrawal } from "./types";
import { platformsFromRow } from "./types";

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
    spots_left: Number(row.spots_left ?? 0),
    spots_total: Number(row.spots_total ?? 0),
    category: String(row.category ?? "General"),
    platform: platforms.length === 3 ? "all" : platforms[0],
    platforms,
    description: String(row.description ?? ""),
    rules: (row.rules as string | null) ?? null,
    base_pay: Number(row.base_pay ?? 10),
    view_bonus_per_1k: Number(row.view_bonus_per_1k ?? 0),
    // Per-post cap (migration 0007); older rows fall back to the old
    // per-video / earn-up-to value, then the $75 default.
    max_payout_per_post: Number(
      row.max_payout_per_post ?? row.max_per_video ?? row.earn_up_to ?? 75
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
    status: (row.status as Submission["status"]) ?? "pending",
    earnings: Number(row.earnings ?? 0),
    hold_until: (row.hold_until as string | null) ?? null,
    views_refreshed_at: (row.views_refreshed_at as string | null) ?? null,
    how_made: String(row.how_made ?? ""),
    proof_screenshots: Array.isArray(row.proof_screenshots)
      ? (row.proof_screenshots as string[])
      : [],
    is_duplicate: Boolean(row.is_duplicate),
    created_at: String(row.created_at ?? ""),
  };
}

/**
 * A campaign is live only while it is funded, status "live", has
 * budget left, and its duration has not run out (ends_at null means
 * it runs until the budget ends). Use for Discover lists and the
 * detail-page guard — a campaign auto-ends on duration OR budget 0,
 * whichever comes first.
 */
export function isCampaignLive(c: Campaign, now: number = Date.now()): boolean {
  if (!c.is_funded || c.status !== "live") return false;
  if (c.budget_left <= 0) return false;
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return false;
  return true;
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
    if (!error && data) {
      const now = Date.now();
      return (data as Record<string, unknown>[])
        .map(mapCampaign)
        .filter((c) => isCampaignLive(c, now));
    }
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
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapCampaign);
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
    };
  }
  // 2) Fallback: the owner can read every submission via RLS.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return null;
  const { data: rows, error: qError } = await supabase
    .from("submissions")
    .select("user_id, status, created_at")
    .eq("campaign_id", campaignId);
  if (qError || !rows) return null;
  const list = rows as Record<string, unknown>[];
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return {
    total: list.length,
    approved: list.filter((r) => r.status === "approved").length,
    members: new Set(list.map((r) => String(r.user_id))).size,
    active30d: list.filter(
      (r) => new Date(String(r.created_at)).getTime() >= cutoff
    ).length,
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
    .select("*, campaigns(title, view_bonus_per_1k, max_payout_per_post)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => {
    const s = mapSubmission(row);
    const camp = row.campaigns as {
      title?: string;
      view_bonus_per_1k?: number;
      max_payout_per_post?: number;
    } | null;
    s.campaign_title = camp?.title;
    s.rate_per_1k = Number(camp?.view_bonus_per_1k ?? 0) || undefined;
    s.max_payout_per_post =
      Number(camp?.max_payout_per_post ?? 0) || undefined;
    return s;
  });
}

/** All submissions, newest first — owner only. */
export async function getAllSubmissions(): Promise<Submission[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("submissions")
    .select("*, campaigns(title, view_bonus_per_1k, max_payout_per_post)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => {
    const s = mapSubmission(row);
    const camp = row.campaigns as {
      title?: string;
      view_bonus_per_1k?: number;
      max_payout_per_post?: number;
    } | null;
    s.campaign_title = camp?.title;
    s.rate_per_1k = Number(camp?.view_bonus_per_1k ?? 0) || undefined;
    s.max_payout_per_post =
      Number(camp?.max_payout_per_post ?? 0) || undefined;
    return s;
  });
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
      // Function missing (migration 0011 not run yet) — ignore.
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
  if (error || !data) return [];
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
    .limit(200);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapWithdrawal);
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
 * Messages on one campaign, oldest first — for the payment-page
 * chat thread. RLS (migration 0015) lets a brand read every message
 * on its own campaigns (its own and the admin's replies) and the
 * owner read all, so the caller must own the campaign or be the
 * owner. The new columns are selected explicitly, so this returns
 * [] when migration 0015 has not run yet.
 */
export async function getCampaignMessages(
  campaignId: string
): Promise<BrandMessage[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("brand_messages")
      .select(
        "id, campaign_id, user_id, message, proof_url, sender, message_type, image_path, created_at, is_read"
      )
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(mapBrandMessage);
  } catch {
    return [];
  }
}

/**
 * Every brand message, newest first — owner only (admin inbox).
 * Joins the campaign so each message shows its campaign title,
 * brand name and submitted Transaction ID. Returns [] when
 * migration 0015 has not run yet.
 */
export async function getBrandMessages(): Promise<BrandMessage[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("brand_messages")
      .select(
        "id, campaign_id, user_id, message, proof_url, sender, message_type, image_path, created_at, is_read, campaigns(title, brand_name, payment_tx_id)"
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(mapBrandMessage);
  } catch {
    return [];
  }
}
