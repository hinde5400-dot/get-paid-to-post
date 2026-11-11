import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { checkDiscordWebhook } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/notify-health — owner-only Discord webhook
 * health check (Round-4 P2-A8).
 *
 * A dead webhook used to fail silently: brand-payment alerts
 * stopped arriving with no signal anywhere. This route GETs the
 * configured webhook URL — Discord returns the webhook object,
 * so it proves the URL is live and reachable WITHOUT sending
 * any message to Discord. Returns:
 *   { ok: true, status: "ok", detail } — Discord answered.
 *   { ok: false, status: "failing", detail } — Discord answered
 *     with an error, or did not answer (deleted/rotated webhook,
 *     network failure, timeout).
 *   { ok: false, status: "not_configured", detail } — no (valid)
 *     webhook URL is set.
 * The webhook URL itself is never returned or logged.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }
  const profile = await getProfile(auth.user.id);
  if (!isOwner(profile)) {
    return NextResponse.json(
      { error: "Notification health is owner-only." },
      { status: 403 }
    );
  }
  // Best-effort rate limit (see lib/rate-limit.ts): 10 health
  // checks per minute per admin, same pattern as the other
  // admin routes — the check hits Discord on every call.
  const rl = rateLimit(`admin-notify-health:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  const result = await checkDiscordWebhook();
  return NextResponse.json({
    ok: result.status === "ok",
    status: result.status,
    detail: result.detail,
  });
}
