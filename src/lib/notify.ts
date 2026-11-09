// Discord notifications to the owner (P0 batch 3).
//
// Turn creates the Discord webhook later — until then there is no
// webhook URL configured and this is a graceful no-op. The two
// call sites (brand payment submitted, brand proof screenshot
// uploaded) fire-and-forget: a Discord failure must NEVER throw
// or break the brand's request, so every failure is swallowed
// after a server-side log. The webhook URL itself is never logged.
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
 */
export async function notifyDiscord(content: string): Promise<boolean> {
  const url = (process.env.DISCORD_WEBHOOK_URL ?? "").trim();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
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
