export type Platform = "tiktok" | "instagram" | "youtube";

export const ALL_PLATFORMS: Platform[] = ["tiktok", "instagram", "youtube"];

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
