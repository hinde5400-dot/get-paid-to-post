import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser, getProfile } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import { SITE_URL, TIKTOK_REDIRECT_URI, TIKTOK_SCOPES } from "@/lib/constants";

/**
 * GET /api/auth/tiktok — start TikTok Login Kit (OAuth 2.0).
 *
 * NOTE 2026-11-08: redeploy-with-cache kept sending the OLD client key,
 * so this file was touched to force a fresh build that picks up the
 * updated TIKTOK_CLIENT_KEY from Vercel.
 *
 * The creator must be logged in. We generate a random `state`, keep it
 * in a short-lived httpOnly cookie (CSRF defence), and send the creator
 * to TikTok's consent page. TikTok redirects back to
 * /api/auth/tiktok/callback with a one-time `code`.
 *
 * Scopes are deliberately minimal — only what views need:
 * user.info.basic (who the account is) + video.list (their videos).
 *
 * Needs Vercel env vars TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET
 * (from the TikTok Developer app, after Turn creates it). Until the
 * key is set this redirects to /connect with tiktok=not_configured
 * instead of crashing.
 */
export const dynamic = "force-dynamic";

const STATE_COOKIE = "tiktok_oauth_state";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", SITE_URL));
  }
  // A blocked account connects no OAuth account.
  const profile = await getProfile(user.id);
  if (profile?.is_blocked) {
    return new NextResponse("This account is blocked.", { status: 403 });
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return NextResponse.redirect(
      new URL("/connect?tiktok=not_configured", SITE_URL)
    );
  }

  const state = randomBytes(16).toString("hex");
  const authorize = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authorize.searchParams.set("client_key", clientKey);
  authorize.searchParams.set("scope", TIKTOK_SCOPES);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", TIKTOK_REDIRECT_URI);
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes — long enough to approve on TikTok.
  });
  return response;
}

/**
 * DELETE /api/auth/tiktok — disconnect TikTok: delete the creator's
 * saved TikTok connection(s) so the account is unlinked. The creator
 * can reconnect anytime. Needs migration 0017 (DELETE policy for
 * your own rows); without it this returns a 500 instead of
 * pretending the disconnect worked.
 */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }
  // A blocked account disconnects nothing — the block is supposed
  // to stop all activity, including (re)connecting OAuth.
  const profile = await getProfile(user.id);
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
  }
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  const { error } = await supabase
    .from("tiktok_connections")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    console.error("Disconnecting TikTok failed:", error.message);
    return NextResponse.json(
      { error: "Could not disconnect TikTok. Please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
