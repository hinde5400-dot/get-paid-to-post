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
// Instagram OAuth — Meta app "Get Paid To Post" (App ID
// 1433209415104875, Unified login / Instagram API with Instagram
// Login). The redirect URI must be registered in the Meta app
// (Instagram API → Instagram Login → OAuth Redirect URIs)
// character for character, or Meta refuses the login.
// Scopes are deliberately minimal — only what reading a creator's
// own Reel views needs: instagram_business_basic (profile + own
// media) + instagram_business_manage_insights (the `views`
// insight on their Reels). The app never posts, comments or
// messages. Needs Vercel env vars INSTAGRAM_APP_ID /
// INSTAGRAM_APP_SECRET. Until they are set this redirects to
// /connect with instagram=not_configured instead of crashing.
// NOTE: while the app is in Development mode, only Instagram
// Testers (Roles → Instagram Testers) can connect — e9064136 is
// the first tester. App Review + business verification come later.
export const INSTAGRAM_REDIRECT_URI = `${SITE_URL}/api/auth/instagram/callback`;
export const INSTAGRAM_SCOPES =
  "instagram_business_basic,instagram_business_manage_insights";

// Community — support runs on Discord only (no live chat on site).
export const DISCORD_URL = "https://discord.gg/kyNcGQkE7y";
export const DISCORD_BADGE = "Support Tickets, Announcements, and Community - All on Discord";

// Withdrawals — USDT only, on the TRON network (TRC20). Bank, Wise,
// PayPal, JazzCash and Easypaisa are not offered for now. (Turn's
// decision 2026-11-11: TRC20 only — the second network option was
// removed everywhere; no withdrawal on the other network ever
// existed.)
export type WithdrawMethod = "usdt_trc20";
export const WITHDRAW_METHOD_LABELS: Record<string, string> = {
  usdt_trc20: "USDT (TRC20)",
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
export const MAX_PAYOUT_DEFAULT = 100; // USD, default max payout per post
export const MAX_PAYOUT_MIN = 10; // USD, minimum max payout per post
export const MAX_PAYOUT_MAX = 200; // USD, maximum max payout per post
export const WITHDRAW_MIN = 15; // USD, minimum withdrawal
export const WITHDRAW_FEE_RATE = 0.05; // 5% at withdrawal
export const PLATFORM_FEE_RATE = 0.15; // 15% flat platform fee, charged ON TOP of the brand's budget (first campaign = repeat campaign): the brand sends budget + 15%, and the campaign runs on the full budget
export const HOLD_HOURS = 72; // approved earnings sit in a 72-hour hold
export const VIEW_REFRESH_HOURS = 3; // pending clips re-check views every 3 hours
export const VIEW_REFRESH_MS = VIEW_REFRESH_HOURS * 60 * 60 * 1000;
export const VIEWS_TRACKED_DAYS = 14; // views tracked for 14 days
// Clip limit (Turn's decision, P0 batch 2): 15 APPROVED clips per
// platform per campaign per creator (TikTok 15, Instagram 15,
// YouTube 15). Rejected clips do NOT count toward the 15.
export const MAX_APPROVED_CLIPS_PER_PLATFORM = 15;
export const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours, per platform
// 30-minute submit rule (Turn's decision 2026-11-10, matches Content
// Rewards exactly): a creator must submit the post link within 30
// minutes of posting the video. A link posted more than 30 minutes
// earlier is not accepted at submit time.
export const SUBMIT_WINDOW_MINUTES = 30;
export const SUBMIT_WINDOW_MS = SUBMIT_WINDOW_MINUTES * 60 * 1000;
export const HOW_MADE_MIN_WORDS = 10;
export const MAX_PROOF_SCREENSHOTS = 3;
