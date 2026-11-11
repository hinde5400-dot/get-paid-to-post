// Discord notifications to the owner (P0 batch 3).
//
// Turn creates the Discord webhook later — until then there is no
// webhook URL configured and this is a graceful no-op. The call
// sites fire-and-forget: a Discord failure must NEVER throw or
// break the brand's request, so every failure is swallowed after a
// server-side log. The webhook URL itself is never logged.
//
// Call sites (all fire-and-forget via the helpers below):
// - campaign created → notifyCampaignCreated (full details +
//   payment page link), wired in src/app/api/campaigns/route.ts.
// - brand payment submitted (TxID) → notifyPaymentProof,
//   wired in src/app/api/campaigns/[id]/payment/route.ts.
// - brand proof screenshot / TxID in the brand chat →
//   notifyPaymentProof, wired in
//   src/app/api/campaigns/[id]/messages/route.ts.
// - fraud flags → notifyDiscord directly (src/lib/fraud.ts).
//
// Per-brand threads: #admin-alerts must be a FORUM channel for
// per-brand threads to work — passing thread_name in the webhook
// payload makes Discord create a separate forum post (thread)
// per brand there. If #admin-alerts is a plain text channel
// instead, Discord rejects the forum post (non-2xx) and
// notifyDiscord falls back to a plain webhook post without
// thread_name, so the notification still arrives (in the one
// shared channel, not a per-brand thread).
//
// Env (set in Vercel when Turn creates the webhook — never in the
// repo):
// - DISCORD_WEBHOOK_URL — the webhook URL to POST to.
// - DISCORD_ADMIN_MENTION — Turn's Discord user ID, used as the
//   <@USER_ID> mention prefix. Optional; the message is sent
//   without a mention when it is unset.
//
// Round-4 P2-A8: a dead webhook used to fail silently — one
// server-side log line per event, no validation, no timeout, no
// admin-visible state. The URL is now validated on first use
// (must be a real Discord webhook URL), every POST has a 10s
// timeout, failures are logged distinctly, and GET
// /api/admin/notify-health probes the webhook (a GET returns the
// webhook object — a connectivity check that sends nothing) so
// the owner can test notifications from /admin Settings.

import {
  MAX_PAYOUT_DEFAULT,
  PLATFORM_LABELS,
  SITE_URL,
} from "./constants";
import { formatUSD } from "./money";

/** True when the value looks like a Discord webhook URL:
 *  https://discord.com/api/webhooks/<id>/<token> (or the older
 *  discordapp.com host). Anything else can never deliver, so it
 *  is rejected before any fetch is attempted. */
export function isDiscordWebhookUrl(raw: string): boolean {
  return /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+/.test(
    raw.trim()
  );
}

/** The configured webhook URL, or null when unset or not a valid
 *  Discord webhook URL. The invalid-URL warning is logged once
 *  per process, not on every notification, so a typo'd URL does
 *  not flood the logs. */
let invalidUrlWarned = false;

export function discordWebhookUrl(): string | null {
  const url = (process.env.DISCORD_WEBHOOK_URL ?? "").trim();
  if (!url) return null;
  if (!isDiscordWebhookUrl(url)) {
    if (!invalidUrlWarned) {
      invalidUrlWarned = true;
      // The URL itself is never logged — it is a secret.
      console.error(
        "[notifyDiscord] DISCORD_WEBHOOK_URL is set but is not a valid Discord webhook URL — notifications are disabled until it is fixed."
      );
    }
    return null;
  }
  return url;
}

/** Fetch timeout for Discord calls (P2-A8): a hung webhook used
 *  to hang the notification forever. 10 seconds is generous for
 *  a webhook POST/GET. */
export const DISCORD_FETCH_TIMEOUT_MS = 10_000;

/** "<@123…>" mention, or "" when no admin mention is configured. */
export function adminMention(): string {
  const raw = (process.env.DISCORD_ADMIN_MENTION ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("<@")) return raw;
  return `<@${raw}>`;
}

/**
 * Post a message to the owner's Discord webhook. Returns false
 * when no webhook is configured or the send fails — never throws.
 *
 * @param content — the message text.
 * @param threadName — optional forum-post title, e.g.
 *   "BrandName — Campaign Title". When given, the webhook payload
 *   includes thread_name so Discord creates a separate forum post
 *   (thread) per brand in the #admin-alerts forum channel. When
 *   Discord rejects that forum post (non-2xx, e.g. #admin-alerts
 *   is a plain text channel), this falls back to one plain webhook
 *   post without thread_name so the notification still arrives.
 *   Fraud alerts call this with content only — no thread name.
 */
export async function notifyDiscord(
  content: string,
  threadName?: string
): Promise<boolean> {
  const url = discordWebhookUrl();
  if (!url) return false;
  // Discord forum post titles are capped at 100 characters.
  const thread = threadName?.trim().slice(0, 100) || undefined;
  const post = (body: Record<string, string>) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // P2-A8: a hung webhook no longer hangs the notification.
      signal: AbortSignal.timeout(DISCORD_FETCH_TIMEOUT_MS),
    });
  try {
    if (thread) {
      const res = await post({ content, thread_name: thread });
      if (res.ok) return true;
      console.error(
        `[notifyDiscord] Discord webhook rejected forum thread (${res.status}); retrying as a plain message.`
      );
      // Fall through to the plain-post retry below (one retry only).
    }
    const res = await post({ content });
    if (!res.ok) {
      console.error(
        `[notifyDiscord] Discord webhook returned ${res.status}.`
      );
      return false;
    }
    return true;
  } catch (err) {
    // Distinct log lines (P2-A8): a timeout is a different
    // failure from a network error, and the owner reading the
    // logs needs to tell them apart.
    if (err instanceof Error && err.name === "TimeoutError") {
      console.error(
        `[notifyDiscord] Discord webhook timed out after ${DISCORD_FETCH_TIMEOUT_MS / 1000}s — notification NOT sent.`
      );
    } else {
      console.error("[notifyDiscord] Failed to send Discord notification:", err);
    }
    return false;
  }
}

/**
 * Connectivity check for GET /api/admin/notify-health (P2-A8):
 * a GET on a webhook URL returns the webhook object — it proves
 * the URL is live and reachable WITHOUT sending any message to
 * Discord. Returns "ok" when Discord answers 2xx, "failing"
 * otherwise, and "not_configured" when no (valid) webhook URL
 * is set. Never throws, never logs the URL.
 */
export async function checkDiscordWebhook(): Promise<{
  status: "ok" | "failing" | "not_configured";
  detail: string;
}> {
  const url = discordWebhookUrl();
  if (!url) {
    const configured = Boolean(
      (process.env.DISCORD_WEBHOOK_URL ?? "").trim()
    );
    return {
      status: "not_configured",
      detail: configured
        ? "A webhook URL is set, but it is not a valid Discord webhook URL."
        : "No Discord webhook URL is configured.",
    };
  }
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(DISCORD_FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      return {
        status: "ok",
        detail: "Discord answered — notifications are working.",
      };
    }
    console.error(
      `[notifyDiscord] Webhook health check failed: Discord returned ${res.status}.`
    );
    return {
      status: "failing",
      detail: `Discord returned ${res.status} — the webhook may be deleted or rotated.`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      console.error(
        `[notifyDiscord] Webhook health check timed out after ${DISCORD_FETCH_TIMEOUT_MS / 1000}s.`
      );
      return {
        status: "failing",
        detail: "Discord did not answer within 10 seconds.",
      };
    }
    console.error("[notifyDiscord] Webhook health check failed:", err);
    return {
      status: "failing",
      detail: "Could not reach Discord.",
    };
  }
}

/**
 * The campaign fields a Discord notification needs. Every field
 * except `id` is optional so callers can pass a raw DB row, a
 * mapped Campaign, or just the values the creation route already
 * has in scope — missing values fall back to the site defaults
 * (min views 1,000, max per post $100) instead of breaking the
 * message. `rates` is the per-platform map ({ tiktok: 2 }); when
 * it is absent the single legacy rate (`view_bonus_per_1k`, else
 * `rate_per_1m` / 1,000) is used, so this also works if the form
 * moves to one rate for all platforms.
 */
export type NotifyCampaign = {
  id: string;
  brand_name?: string | null;
  title?: string | null;
  budget_total?: number | null;
  platform_fee?: number | null;
  rates?: Record<string, number> | null;
  view_bonus_per_1k?: number | null;
  rate_per_1m?: number | null;
  min_views?: number | null;
  max_payout_per_post?: number | null;
  payment_tx_id?: string | null;
};

function campaignBrand(campaign: NotifyCampaign): string {
  return String(campaign.brand_name ?? "").trim() || "A brand";
}

function campaignTitle(campaign: NotifyCampaign): string {
  return String(campaign.title ?? "").trim() || "Untitled campaign";
}

function campaignThreadName(campaign: NotifyCampaign): string {
  return `${campaignBrand(campaign)} — ${campaignTitle(campaign)}`;
}

/** "Rate: $2.00 per 1k views" — or one entry per platform when the
 *  campaign pays different rates per platform. */
function rateLine(campaign: NotifyCampaign): string {
  const entries = Object.entries(campaign.rates ?? {}).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === "number" &&
      Number.isFinite(entry[1]) &&
      entry[1] > 0
  );
  if (entries.length > 0) {
    const unique = [...new Set(entries.map(([, v]) => v))];
    if (unique.length === 1) {
      return `Rate: ${formatUSD(unique[0])} per 1k views`;
    }
    return `Rates per 1k views: ${entries
      .map(
        ([p, v]) =>
          `${PLATFORM_LABELS[p] ?? p} ${formatUSD(v)}`
      )
      .join(" · ")}`;
  }
  const single =
    Number(campaign.view_bonus_per_1k ?? 0) ||
    Number(campaign.rate_per_1m ?? 0) / 1000;
  return `Rate: ${formatUSD(single)} per 1k views`;
}

/**
 * The full campaign details block shared by every brand
 * notification, so Turn can decide from Discord alone: brand,
 * title, budget (with the 15% fee split and the total the brand
 * has to send), rate per 1k views, max payout per post, and
 * minimum views per clip.
 */
export function formatCampaignDetails(campaign: NotifyCampaign): string {
  const budget = Number(campaign.budget_total ?? 0);
  const fee = Number(campaign.platform_fee ?? 0);
  const budgetLine =
    fee > 0
      ? `Budget: ${formatUSD(budget)} (+ ${formatUSD(fee)} platform fee = ${formatUSD(budget + fee)} total to send)`
      : `Budget: ${formatUSD(budget)}`;
  return [
    `Brand: ${campaignBrand(campaign)}`,
    `Campaign: "${campaignTitle(campaign)}"`,
    budgetLine,
    rateLine(campaign),
    `Max per post: ${formatUSD(Number(campaign.max_payout_per_post ?? MAX_PAYOUT_DEFAULT))}`,
    `Min views per clip: ${Number(campaign.min_views ?? 1000).toLocaleString("en-US")}`,
  ].join("\n");
}

/**
 * Campaign-created notification (Item 11a): fires when a brand
 * submits a campaign, with the FULL details plus the payment page
 * link — the brand lands there next, and Turn sees the numbers
 * before any money moves. Same per-brand forum thread as the
 * payment notifications. Fire-and-forget; never throws.
 */
export async function notifyCampaignCreated(
  campaign: NotifyCampaign
): Promise<boolean> {
  const mention = adminMention();
  const prefix = mention ? `${mention} ` : "";
  const message = [
    `${prefix}🆕 New campaign created — ${campaignBrand(campaign)} submitted "${campaignTitle(campaign)}".`,
    ``,
    formatCampaignDetails(campaign),
    ``,
    `💳 Payment page: ${SITE_URL}/brands/payment/${campaign.id}`,
    `The campaign stays PENDING until the brand sends the budget + 15% fee — check your wallet, then approve it: ${SITE_URL}/admin`,
  ].join("\n");
  return notifyDiscord(message, campaignThreadName(campaign));
}

/**
 * Payment-proof notification (Item 11b): fires when the brand
 * sends payment proof — a Transaction ID (via the payment form or
 * pasted in the brand chat) and/or a proof screenshot in the brand
 * chat — with the TxID, the proof link, and the full campaign
 * details. This is the moment Turn needs to check his wallet and
 * approve, so the message says so outright. `proofUrl` is the
 * owner-only proof-image link (or the brand-chat link when the
 * proof is text-only); omit it when there is no proof to link to.
 * Same per-brand forum thread as the campaign-created
 * notification. Fire-and-forget; never throws.
 */
export async function notifyPaymentProof(
  campaign: NotifyCampaign,
  opts?: { txId?: string | null; proofUrl?: string | null }
): Promise<boolean> {
  const mention = adminMention();
  const prefix = mention ? `${mention} ` : "";
  const txId = String(
    opts?.txId ?? campaign.payment_tx_id ?? ""
  ).trim();
  const proofUrl = String(opts?.proofUrl ?? "").trim();
  const message = [
    `${prefix}💰 Payment proof received — ${campaignBrand(campaign)} sent payment proof for "${campaignTitle(campaign)}".`,
    ``,
    formatCampaignDetails(campaign),
    ``,
    txId
      ? `Transaction ID: ${txId}`
      : `Transaction ID: not submitted yet — ask the brand to paste it on the payment page.`,
    proofUrl ? `Proof: ${proofUrl}` : `Proof: no screenshot attached yet.`,
    `Chat: ${SITE_URL}/brands/payment/${campaign.id}#brand-chat`,
    `Check your wallet, then approve the campaign: ${SITE_URL}/admin`,
  ].join("\n");
  return notifyDiscord(message, campaignThreadName(campaign));
}
