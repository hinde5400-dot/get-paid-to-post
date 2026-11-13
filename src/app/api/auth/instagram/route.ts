import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser, getProfile } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import {
  SITE_URL,
  INSTAGRAM_CONFIG_ID,
  INSTAGRAM_REDIRECT_URI,
} from "@/lib/constants";

/**
 * GET /api/auth/instagram — start Meta's Instagram Login
 * (Unified login / Instagram API with Instagram Login, OAuth 2.0).
 *
 * The creator must be logged in. We generate a random `state`,
 * keep it in a short-lived httpOnly cookie (CSRF defence), and
 * send the creator to Instagram's consent page. Instagram
 * redirects back to /api/auth/instagram/callback with a one-time
 * `code`.
 *
 * Scopes are deliberately minimal — only what views need:
 * instagram_business_basic (who the account is + their own media)
 * + instagram_business_manage_insights (the `views` insight on
 * their Reels). The app never posts, comments or messages.
 *
 * Needs Vercel env vars INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET
 * (Meta app "Get Paid To Post", App ID 1433209415104875). Until
 * they are set this redirects to /connect with
 * instagram=not_configured instead of crashing.
 *
 * NOTE: while the Meta app is in Development mode, only Instagram
 * Testers (Roles → Instagram Testers in the app dashboard) can
 * connect — a creator who is not a tester sees Meta refuse the
 * login. App Review + business verification come later.
 */
export const dynamic = "force-dynamic";

const STATE_COOKIE = "instagram_oauth_state";

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

  const appId = process.env.INSTAGRAM_APP_ID;
  if (!appId) {
    return NextResponse.redirect(
      new URL("/connect?instagram=not_configured", SITE_URL)
    );
  }

  const state = randomBytes(16).toString("hex");
  // Unified login (Meta dashboard): the legacy Instagram authorize
  // endpoint rejects this app ("Invalid platform app") — the app
  // must authorize through the Facebook dialog with its Login
  // Configuration ID. No scope param: the configuration governs
  // permissions, and IG Login scope names are rejected by the dialog.
  const authorize = new URL("https://www.facebook.com/dialog/oauth");
  authorize.searchParams.set("client_id", appId);
  authorize.searchParams.set("config_id", INSTAGRAM_CONFIG_ID);
  authorize.searchParams.set("redirect_uri", INSTAGRAM_REDIRECT_URI);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes — long enough to approve on Instagram.
  });
  return response;
}

/**
 * DELETE /api/auth/instagram — disconnect Instagram: delete the
 * creator's saved Instagram connection(s) so the account is
 * unlinked. The creator can reconnect anytime. Needs migration
 * 0045 (DELETE policy for your own rows); without it this returns
 * a 500 instead of pretending the disconnect worked.
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
    .from("instagram_connections")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    console.error("Disconnecting Instagram failed:", error.message);
    return NextResponse.json(
      { error: "Could not disconnect Instagram. Please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
