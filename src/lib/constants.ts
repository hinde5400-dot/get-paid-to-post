// Get Paid To Post — shared constants.
// Brand name: "Get Paid To Post" (owner's pick, option D).
// Repo / Vercel project: get-paid-to-post
// Free domain: get-paid-to-post.vercel.app

export const BRAND_NAME = "Get Paid To Post";
export const BRAND_TAGLINE = "Post Clips. Get Paid Per View.";
export const REPO_NAME = "get-paid-to-post";
export const SITE_DOMAIN = "get-paid-to-post.vercel.app";
export const SITE_URL = `https://${SITE_DOMAIN}`;
// TikTok Login Kit — this exact URI must be registered in the TikTok
// Developer app (Login Kit → Redirect URI). One wrong slash and the
// login fails. The callback route lives at this path.
export const TIKTOK_REDIRECT_URI = `${SITE_URL}/api/auth/tiktok/callback`;
// Minimal scopes — only what reading a creator's own video views needs.
export const TIKTOK_SCOPES = "user.info.basic,video.list";
// YouTube OAuth — Google login for a creator's own channel.
// The redirect URI must be registered in the Google Cloud OAuth
// client (APIs & Services → Credentials → OAuth client ID, Web
// application) character for character, or Google refuses the login.
// Scope is deliberately read-only: youtube.readonly only lets the
// site read the connected channel's id/title and list its own
// videos — it can never upload, edit or delete anything. Needs
// Vercel env vars GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
export const YOUTUBE_OAUTH_REDIRECT_URI = `${SITE_URL}/api/auth/youtube/callback`;
export const YOUTUBE_OAUTH_SCOPES =
  "https://www.googleapis.com/auth/youtube.readonly";

// Community — support runs on Discord only (no live chat on site).
export const DISCORD_URL = "https://discord.gg/kyNcGQkE7y";
export const DISCORD_BADGE = "Support Tickets, Announcements, and Community - All on Discord";

// Withdrawals — USDT only (TRC20 / BEP20). Bank, Wise, PayPal,
// JazzCash and Easypaisa are not offered for now.
export const WITHDRAW_METHODS = [
  { key: "usdt_trc20", label: "USDT (TRC20)" },
  { key: "usdt_bep20", label: "USDT (BEP20)" },
] as const;
export type WithdrawMethod = (typeof WITHDRAW_METHODS)[number]["key"];
export const WITHDRAW_METHOD_LABELS: Record<string, string> = {
  usdt_trc20: "USDT (TRC20)",
  usdt_bep20: "USDT (BEP20)",
  // Legacy rows from before the USDT-only change.
  usdt: "USDT",
  bank_transfer: "Bank Transfer",
  wise: "Wise",
};

export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;

export const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  all: "TikTok · Instagram · YouTube",
};

// Money rules — encode these everywhere, never hard-code different numbers.
// There is NO minimum campaign budget and NO minimum rate: a brand sets
// any budget above $0 and any rate above $0 per 1,000 views.
export const MAX_PAYOUT_DEFAULT = 75; // USD, default max payout per post
export const MAX_PAYOUT_MIN = 10; // USD, minimum max payout per post
export const MAX_PAYOUT_MAX = 200; // USD, maximum max payout per post
export const WITHDRAW_MIN = 15; // USD, minimum withdrawal
export const WITHDRAW_FEE_RATE = 0.07; // 7% at withdrawal
export const PLATFORM_FEE_RATE = 0.15; // 15% flat platform fee, taken inside the brand's budget (first campaign = repeat campaign)
export const HOLD_HOURS = 72; // approved earnings sit in a 72-hour hold
export const VIEW_REFRESH_HOURS = 3; // pending clips re-check views every 3 hours
export const VIEW_REFRESH_MS = VIEW_REFRESH_HOURS * 60 * 60 * 1000;
export const VIEWS_TRACKED_DAYS = 14; // views tracked for 14 days
// Clip limit (Turn's decision, P0 batch 2): 15 APPROVED clips per
// platform per campaign per creator (TikTok 15, Instagram 15,
// YouTube 15). Rejected clips do NOT count toward the 15.
export const MAX_APPROVED_CLIPS_PER_PLATFORM = 15;
export const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours, per platform
export const HOW_MADE_MIN_WORDS = 10;
export const MAX_PROOF_SCREENSHOTS = 3;
