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
 * A platform missing from `rates` falls back to the campaign's legacy
 * single rate (view_bonus_per_1k). Old rows carry rates: {}.
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
 * The rate that applies to a clip on `platform`: the platform's own
 * rate when set, otherwise the campaign's legacy single rate
 * (view_bonus_per_1k). This is the rate review/earnings must use.
 */
export function rateForPlatform(
  campaign: { rates?: PlatformRates | null; view_bonus_per_1k: number },
  platform: Platform
): number {
  const own = campaign.rates?.[platform];
  if (typeof own === "number" && Number.isFinite(own) && own > 0) return own;
  return campaign.view_bonus_per_1k;
}

/** Lowest per-platform rate (for the rate-range display). */
export function minRatePer1k(campaign: {
  rates?: PlatformRates | null;
  view_bonus_per_1k: number;
}): number {
  const values = Object.values(campaign.rates ?? {}).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
  );
  return values.length > 0 ? Math.min(...values) : campaign.view_bonus_per_1k;
}

/** Highest per-platform rate (for "Highest Paying" sort + examples). */
export function maxRatePer1k(campaign: {
  rates?: PlatformRates | null;
  view_bonus_per_1k: number;
}): number {
  const values = Object.values(campaign.rates ?? {}).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
  );
  return values.length > 0 ? Math.max(...values) : campaign.view_bonus_per_1k;
}

/** True when the campaign pays different rates per platform. */
export function ratesDiffer(campaign: {
  rates?: PlatformRates | null;
  view_bonus_per_1k: number;
}): boolean {
  const values = Object.values(campaign.rates ?? {}).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
  );
  return new Set(values).size > 1;
}

/** "TikTok $1.50 · Instagram $1.50 · YouTube $2.00" — per-platform
 *  rates in platform order, for the detail page. Only platforms with
 *  a rate in `rates` are listed; falls back to the legacy rate text
 *  when no per-platform rates exist. */
export function platformRatesText(
  campaign: {
    rates?: PlatformRates | null;
    view_bonus_per_1k: number;
    platforms?: Platform[] | null;
    platform: Platform | "all";
  },
  format: (n: number) => string
): string {
  const platforms = campaignPlatforms(campaign);
  return platforms
    .map(
      (p) =>
        `${p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "YouTube"} ${format(rateForPlatform(campaign, p))}`
    )
    .join(" · ");
}

export interface Campaign {
  id: string;
  brand_name: string;
  /** Who owns the campaign (migration 0013); null on rows written before it. */
  user_id?: string | null;
  /** Transaction ID / hash the brand pasted after paying (migration 0013). */
  payment_tx_id?: string | null;
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
   * Per-platform rates (P1-b, migration 0025): rate per 1,000 views
   * per platform. {} on old rows — rateForPlatform() then falls back
   * to view_bonus_per_1k. The legacy single rate is the first
   * selected platform's rate, so old code paths keep working.
   */
  rates: PlatformRates;
  /**
   * Minimum views a clip needs before it can be approved (P1-b,
   * migration 0025). 0 = no threshold (the default — Turn never
   * chose a site-wide number, so the brand sets one or leaves 0).
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
