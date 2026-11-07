// Get Paid To Post — shared constants.
// Brand name: "Get Paid To Post" (owner's pick, option D).
// Repo / Vercel project: get-paid-to-post
// Free domain: get-paid-to-post.vercel.app

export const BRAND_NAME = "Get Paid To Post";
export const BRAND_TAGLINE = "Post Clips. Get Paid Per View.";
export const REPO_NAME = "get-paid-to-post";
export const SITE_DOMAIN = "get-paid-to-post.vercel.app";
export const SITE_URL = `https://${SITE_DOMAIN}`;

// Community — support runs on Discord only (no live chat on site).
export const DISCORD_URL = "https://discord.gg/getpaidtopost";
export const DISCORD_BADGE = "Coming Soon - Discord Server Launching Soon";

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
  pakistani_bank: "Pakistani Bank",
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
export const BRAND_MIN_BUDGET = 500; // USD, minimum to launch a campaign
export const WITHDRAW_MIN = 10; // USD, minimum withdrawal
export const WITHDRAW_FEE_RATE = 0.07; // 7% at withdrawal
export const HOLD_HOURS = 72; // approved earnings sit in a 72-hour hold
export const BASE_PAY = 10; // USD per approved post
export const VIEW_BONUS_PER_1K = 0.75; // USD per 1,000 views
export const VIEWS_TRACKED_DAYS = 14; // views tracked for 14 days
export const MAX_POSTS_PER_CAMPAIGN = 7;
export const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours, per platform
export const HOW_MADE_MIN_WORDS = 10;
export const MAX_PROOF_SCREENSHOTS = 3;
