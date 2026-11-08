import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth";
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
