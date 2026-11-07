export type Platform = "tiktok" | "instagram" | "youtube";

export type SubmissionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";

export interface Campaign {
  id: string;
  brand_name: string;
  logo_url: string | null;
  title: string;
  rate_per_1m: number;
  budget_total: number;
  budget_left: number;
  spots_left: number;
  spots_total: number;
  category: string;
  platform: Platform | "all";
  description: string;
  rules?: string | null;
  base_pay: number;
  view_bonus_per_1k: number;
  /** Most a creator can earn on ONE post, even if views would pay more. */
  max_payout_per_post: number;
  views_tracked_days: number;
  max_posts: number;
  earn_up_to: number;
  is_funded: boolean;
  status: string;
  created_at?: string;
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
  status: SubmissionStatus;
  earnings: number;
  hold_until: string | null;
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

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  tiktok_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  is_admin: boolean;
  is_blocked: boolean;
  created_at: string;
}
