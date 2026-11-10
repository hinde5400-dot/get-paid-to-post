import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser, getProfile } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import {
  SITE_URL,
  YOUTUBE_OAUTH_REDIRECT_URI,
  YOUTUBE_OAUTH_SCOPES,
} from "@/lib/constants";

/**
 * GET /api/auth/youtube — start Google OAuth for YouTube.
 *
 * A creator connects their own YouTube channel with their Google
 * account (scope youtube.readonly — read-only: the site can never
 * upload, edit or delete videos). The channel id saved from this
 * flow is the anti-fraud proof: a YouTube submission only counts
 * when the video's channel matches the connected channel, so
 * nobody can paste someone else's viral video and claim its views.
 *
 * The creator must be logged in. We generate a random `state`, keep
 * it in a short-lived httpOnly cookie (CSRF defence), and send the
 * creator to Google's consent page. Google redirects back to
 * /api/auth/youtube/callback with a one-time `code`.
 *
 * Needs Vercel env vars GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 * (Google Cloud OAuth client, Web application, in the "Get Paid To
 * Post" project). Until they are set this redirects to /connect
 * with youtube=not_configured instead of crashing.
 *
 * Note: the OAuth consent screen starts in Testing mode — only the
 * test users Turn adds in Google Cloud Console can connect until
 * Google verifies the app (a later step, needs a privacy policy).
 */
export const dynamic = "force-dynamic";

const STATE_COOKIE = "youtube_oauth_state";

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

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/connect?youtube=not_configured", SITE_URL)
    );
  }

  const state = randomBytes(16).toString("hex");
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", YOUTUBE_OAUTH_REDIRECT_URI);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", YOUTUBE_OAUTH_SCOPES);
  // offline + prompt=consent so Google returns a refresh token every
  // time (needed to re-read the channel later without asking again).
  authorize.searchParams.set("access_type", "offline");
  authorize.searchParams.set("prompt", "consent");
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes — long enough to approve on Google.
  });
  return response;
}

/**
 * DELETE /api/auth/youtube — disconnect YouTube: delete the
 * creator's saved YouTube connection(s) so the channel is unlinked.
 * The creator can reconnect anytime. Needs migration 0019 (DELETE
 * policy for your own rows); without it this returns a 500 instead
 * of pretending the disconnect worked.
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
    .from("youtube_connections")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    console.error("Disconnecting YouTube failed:", error.message);
    return NextResponse.json(
      { error: "Could not disconnect YouTube. Please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
