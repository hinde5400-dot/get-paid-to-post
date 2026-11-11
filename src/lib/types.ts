export type Platform = "tiktok" | "instagram" | "youtube";

export const ALL_PLATFORMS: Platform[] = ["tiktok", "instagram", "youtube"];

/**
 * Campaign categories (P1-a, Content Rewards model — the filterable
 * board: UGC, Clipping, Lifestyle, Entertainment, Gaming,
 * Technology). A campaign has exactly one. The brand form defaults
 * to "UGC"; the API rejects anything outside this list. Rows written
 * before categories existed carry the legacy "General" value, which
 * migration 0024 backfills to "UGC".
 */
export const CAMPAIGN_CATEGORIES = [
  "UGC",
  "Clipping",
  "Lifestyle",
  "Entertainment",
  "Music",
  "Gaming",
  "Technology",
] as const;
export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number];

export function isCampaignCategory(value: string): value is CampaignCategory {
  return (CAMPAIGN_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Platforms a campaign accepts clips on (migration 0012).
 * New rows store the chosen platforms in campaigns.platforms
 * (text[]); rows written before that migration have platforms null
 * and fall back to the legacy single platform column — "all" means
 * all three, anything else means that one platform.
 */
export function campaignPlatforms(campaign: {
  platforms?: Platform[] | null;
  platform: Platform | "all";
}): Platform[] {
  if (Array.isArray(campaign.platforms) && campaign.platforms.length > 0) {
    const valid = campaign.platforms.filter(
      (p): p is Platform =>
        p === "tiktok" || p === "instagram" || p === "youtube"
    );
    if (valid.length > 0) return [...new Set(valid)];
  }
  return campaign.platform === "all"
    ? [...ALL_PLATFORMS]
    : [campaign.platform];
}

/** Same fallback, for raw Supabase rows (API routes, data.ts). */
export function platformsFromRow(
  row: Record<string, unknown>
): Platform[] {
  const raw = row.platforms;
  if (Array.isArray(raw) && raw.length > 0) {
    const valid = (raw as unknown[]).filter(
      (p): p is Platform =>
        p === "tiktok" || p === "instagram" || p === "youtube"
    );
    if (valid.length > 0) return [...new Set(valid)];
  }
  const legacy = String(row.platform ?? "all");
  return legacy === "all"
    ? [...ALL_PLATFORMS]
    : legacy === "tiktok" || legacy === "instagram" || legacy === "youtube"
      ? [legacy]
      : [...ALL_PLATFORMS];
}

/** "TikTok", "TikTok and Instagram", "TikTok, Instagram and YouTube". */
export function platformNamesText(platforms: Platform[]): string {
  const names = platforms.map(
    (p) => (p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "YouTube")
  );
  if (names.length <= 1) return names[0] ?? "TikTok";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export type SubmissionStatus = "pending" | "approved" | "rejected";

/**
 * Per-platform rates (P1-b, Content Rewards model, migration 0025):
 * rate per 1,000 views per platform, e.g. { tiktok: 1.5, youtube: 2 }.
 * LEGACY — kept only so old rows still parse. A campaign now has
 * ONE rate per 1,000 views for the whole campaign (Turn's
 * decision): rateForPlatform() below always returns the single
 * rate, and no display or payout path may use a per-platform rate.
 */
export type PlatformRates = Partial<Record<Platform, number>>;

export function ratesFromRow(row: Record<string, unknown>): PlatformRates {
  const raw = row.rates as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PlatformRates = {};
  for (const p of ALL_PLATFORMS) {
    const v = Number((raw as Record<string, unknown>)[p]);
    if (Number.isFinite(v) && v > 0) out[p] = v;
  }
  return out;
}

/**
 * The rate that applies to a clip: ALWAYS the campaign's single
 * rate (view_bonus_per_1k). Legacy per-platform `rates` rows are
 * deliberately ignored — one rate per 1,000 views for the whole
 * campaign, the same on TikTok, Instagram and YouTube. This is the
 * rate review/earnings must use.
 */
export function rateForPlatform(
  campaign: { rates?: PlatformRates | null; view_bonus_per_1k: number },
  _platform: Platform
): number {
  return campaign.view_bonus_per_1k;
}

/** The single rate (kept name for the sort + examples). */
export function minRatePer1k(campaign: {
  rates?: PlatformRates | null;
  view_bonus_per_1k: number;
}): number {
  return campaign.view_bonus_per_1k;
}

/** The single rate (kept name for the sort + examples). */
export function maxRatePer1k(campaign: {
  rates?: PlatformRates | null;
  view_bonus_per_1k: number;
}): number {
  return campaign.view_bonus_per_1k;
}

/** Never true any more: one rate applies to the whole campaign. */
export function ratesDiffer(_campaign: {
  rates?: PlatformRates | null;
  view_bonus_per_1k: number;
}): boolean {
  return false;
}

export interface Campaign {
  id: string;
  brand_name: string;
  /** Who owns the campaign (migration 0013); null on rows written before it. */
  user_id?: string | null;
  /** Transaction ID / hash the brand pasted after paying (migration 0013). */
  payment_tx_id?: string | null;
  /** When the TxID was submitted (migration 0038, round-3 P1-7) —
   *  stamped by the payment route on first submit and on every
   *  correction; an unverified TxID expires 7 days after this. */
  payment_tx_submitted_at?: string | null;
  logo_url: string | null;
  title: string;
  rate_per_1m: number;
  budget_total: number;
  budget_left: number;
  /** Total paid out to creators so far (migration 0001) — feeds the
   *  "time left at current rate" burn-rate estimate (P1-a). */
  paid_out: number;
  /** 15% flat platform fee, charged ON TOP of budget_total
   *  (migration 0021). budget_left is the creators pool: the full
   *  budget — the fee is paid on top, never taken out of it. */
  platform_fee: number;
  spots_left: number;
  spots_total: number;
  category: string;
  platform: Platform | "all";
  /** Chosen platforms (migration 0012); null on rows written before it. */
  platforms?: Platform[] | null;
  description: string;
  rules?: string | null;
  view_bonus_per_1k: number;
  /**
   * Per-platform rates (P1-b, migration 0025) — LEGACY. Kept in the
   * DB so old rows still parse; every platform carries the same
   * single rate (view_bonus_per_1k) and rateForPlatform() ignores
   * this map entirely. One rate per 1,000 views for the whole
   * campaign.
   */
  rates: PlatformRates;
  /**
   * Minimum views a clip needs before it can be approved (P1-b,
   * migration 0025; floor raised to 1,000 by migration 0028).
   * Site-wide floor of 1,000 views per clip (Turn's 2026-11-10
   * decision): the default is 1000 and the minimum is 1000 — a
   * brand may set a higher threshold, never a lower one.
   */
  min_views: number;
  /**
   * Most one creator can earn from this campaign in total (P1-b,
   * migration 0025). null = no cap (the default). On top of the
   * 15-approved-clips-per-platform count cap, which stays as-is.
   */
  max_payout_per_creator: number | null;
  /** Most a creator can earn on ONE post, even if views would pay more. */
  max_payout_per_post: number;
  views_tracked_days: number;
  max_posts: number;
  earn_up_to: number;
  is_funded: boolean;
  status: string;
  created_at?: string;
  /** Optional brief / asset link pasted by the brand (migration 0009). */
  brief_url?: string | null;
  /** Optional thumbnail image link used as the card banner (0009). */
  thumbnail_url?: string | null;
  /** Campaign length in days; null = runs until the budget ends (0009). */
  duration_days?: number | null;
  /** Set when the admin approves the campaign (0009). */
  started_at?: string | null;
  /** started_at + duration_days; null when duration is open-ended. */
  ends_at?: string | null;
}

export interface Submission {
  id: string;
  submission_code: string;
  user_id: string;
  campaign_id: string;
  campaign_title?: string;
  /** Campaign rate at submit time, for the earnings breakdown. */
  rate_per_1k?: number;
  /** Campaign per-post cap at submit time, for the breakdown. */
  max_payout_per_post?: number;
  /** Campaign's min-views threshold (P1-b) — shown on the admin
   *  review row so the owner sees it before deciding. */
  campaign_min_views?: number | null;
  /** Campaign's per-creator $ cap (P1-b) — same, shown on the
   *  admin review row. null = no cap. */
  campaign_max_payout_per_creator?: number | null;
  /** Campaign's remaining budget at read time (admin batch 2) —
   *  caps the review card's estimated payout. */
  campaign_budget_left?: number;
  /** When the video itself was posted, from the platform API at
   *  submit time (migration 0031, 30-minute submit rule). Null
   *  when the API could not supply it. */
  posted_at?: string | null;
  /** True when no posted time could be fetched (e.g. Instagram
   *  has no API access yet) — the admin checks the post time by
   *  hand before approving (migration 0031). */
  posted_time_unverified?: boolean;
  /**
   * Approval-time FACTS (migration 0043, round-5 P1): was this
   * approval actually truncated by the campaign's remaining
   * budget, and the view count earnings were locked on. My Posts
   * renders the "Capped by the campaign's remaining budget" line
   * ONLY from budget_capped — never inferred from post-approval
   * view growth (earnings are locked at approval, so that
   * inference falsely flagged every clip whose views grew).
   * Optional with a false/null fallback: rows approved before
   * 0043 (or read before it is applied live) render the plain
   * earnings breakdown, never the capped claim.
   */
  budget_capped?: boolean;
  approval_views?: number | null;
  /** Instagram handle that matched the creator's linked profile
   *  at submit time (migration 0039, round-3 P2-17) — the admin
   *  hand-check anchors on this, not the creator's current
   *  profile link, which may have changed since. Null on
   *  non-Instagram rows and pre-0039 rows. */
  instagram_handle_matched?: string | null;
  bundle_id: string;
  post_url: string;
  platform: Platform;
  views: number;
  likes: number;
  /** Comment count (migration 0022) — with likes, feeds the 1%
   *  engagement minimum: (likes + comments) / views. */
  comments: number;
  status: SubmissionStatus;
  earnings: number;
  /** Why the submission was rejected, when the owner gave one. */
  rejection_reason?: string | null;
  hold_until: string | null;
  /** Last time the 3-hour auto-refresh checked this clip's views. */
  views_refreshed_at?: string | null;
  how_made: string;
  proof_screenshots: string[];
  is_duplicate: boolean;
  created_at: string;
  /** Last update (migration 0001) — for approved rows this is the
   *  approval time, used as the approval date in the post-end
   *  re-check view (P1-c). */
  updated_at?: string | null;
  /** Approval-time facts (migration 0043, Round-5 P1): whether
   *  the approval was truncated by the campaign's remaining
   *  budget, and the view count earnings were locked on. My
   *  Posts renders this stored fact — never an inference from
   *  post-approval view growth. False / null on rows approved
   *  before 0043, or when 0043 has not been applied yet. */
  budget_capped?: boolean;
  approval_views?: number | null;
  /** Active payout-pause flag (migration 0031): the reason the
   *  admin flagged this clip, plus when. Only set while a flag is
   *  open — the creator sees it on My Posts, so a paused payout
   *  is never invisible to the person it affects. */
  flag_reason?: string | null;
  flagged_at?: string | null;
}

export interface Wallet {
  user_id: string;
  available_balance: number;
  pending_balance: number;
  withdrawn_total: number;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  fee: number;
  final_amount: number;
  method: string;
  details: string;
  status: string;
  created_at: string;
}

/** Private two-way brand <-> admin chat message (migrations
 *  0014/0015). sender is 'brand' or 'admin'; message_type is 'text'
 *  or 'image' — proof screenshots are uploaded straight to the
 *  private 'brand-proofs' Storage bucket and image_path is the
 *  object path (<campaign_id>/<uuid>.<ext>). proof_url is a legacy
 *  field from the one-way link inbox and is no longer used.
 *  campaign_title / brand_name / payment_tx_id are filled in from
 *  the joined campaign row when the admin inbox loads. */
export interface BrandMessage {
  id: string;
  campaign_id: string;
  user_id: string;
  message: string;
  proof_url: string | null;
  sender: "brand" | "admin";
  message_type: "text" | "image";
  image_path: string | null;
  created_at: string;
  is_read: boolean;
  /** Brand-side read state (migration 0043, Round-5 P2): whether
   *  the BRAND has read this (admin-sent) message. is_read is the
   *  admin's own read state — the two must never be conflated, or
   *  the admin opening a thread clears the brand's "New reply
   *  from admin" badge before the brand reads it. Undefined on
   *  rows loaded before 0043 is applied. */
  brand_read?: boolean;
  campaign_title?: string;
  brand_name?: string;
  payment_tx_id?: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  /** 'creator' or 'brand' (migration 0008); null on rows created before it. */
  role?: "creator" | "brand" | null;
  /** Brand display name for brand accounts (migration 0008). */
  brand_name?: string | null;
  tiktok_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  is_admin: boolean;
  is_blocked: boolean;
  created_at: string;
}
