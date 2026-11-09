// Discord notifications to the owner (P0 batch 3).
//
// Turn creates the Discord webhook later — until then there is no
// webhook URL configured and this is a graceful no-op. The two
// call sites (brand payment submitted, brand proof screenshot
// uploaded) fire-and-forget: a Discord failure must NEVER throw
// or break the brand's request, so every failure is swallowed
// after a server-side log. The webhook URL itself is never logged.
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
  const url = (process.env.DISCORD_WEBHOOK_URL ?? "").trim();
  if (!url) return false;
  // Discord forum post titles are capped at 100 characters.
  const thread = threadName?.trim().slice(0, 100) || undefined;
  const post = (body: Record<string, string>) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    console.error("[notifyDiscord] Failed to send Discord notification:", err);
    return false;
  }
}
