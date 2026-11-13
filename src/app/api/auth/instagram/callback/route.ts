import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import {
  SITE_URL,
  INSTAGRAM_REDIRECT_URI,
  INSTAGRAM_SCOPES,
} from "@/lib/constants";
import { encryptToken } from "@/lib/views/crypto";

/**
 * GET /api/auth/instagram/callback — Instagram Login redirect
 * target.
 *
 * This is the exact Redirect URI registered in the Meta app
 * (Instagram API → Instagram Login → OAuth Redirect URIs): it
 * must match character for character or Meta refuses the login.
 *
 * Flow: verify `state` against the cookie set by
 * /api/auth/instagram, exchange the one-time `code` server-side
 * for a short-lived token (POST
 * https://graph.instagram.com/oauth/access_token — the Instagram
 * API with Instagram Login (Unified login) endpoint; the legacy
 * api.instagram.com endpoint REJECTS codes issued by the
 * facebook.com/dialog/oauth authorize URL), exchange that
 * for a 60-day long-lived token (GET
 * https://graph.instagram.com/access_token), fetch the creator's
 * Instagram profile (GET /me), then save the connection in
 * public.instagram_connections (migration 0045) so later code can
 * read their Reels' view counts via the Graph API.
 *
 * Tokens live 60 days (long-lived) — the 3-hour view-refresh job
 * refreshes them when they are inside their last 7 days. Nothing
 * here is deployed or run until the migration is applied and the
 * Vercel env vars are set; every failure redirects to /connect
 * with an instagram= status instead of showing an error page. The
 * App Secret never leaves the server and is never logged.
 */
export const dynamic = "force-dynamic";

const STATE_COOKIE = "instagram_oauth_state";
const SHORT_TOKEN_URL = "https://graph.instagram.com/oauth/access_token";
const LONG_TOKEN_URL = "https://graph.instagram.com/access_token";
const ME_URL = "https://graph.instagram.com/me?fields=id,username,account_type";

function fail(status: string) {
  return NextResponse.redirect(
    new URL(`/connect?instagram=${status}`, SITE_URL)
  );
}

interface ShortTokenResponse {
  access_token?: string;
  user_id?: number;
}

interface LongTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface MeResponse {
  id?: string;
  username?: string;
  account_type?: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return fail("denied");
  }
  if (!code || !state) {
    return fail("missing_code");
  }

  // CSRF check: the state must match the cookie set when the flow started.
  const cookieStore = cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  if (!expectedState || expectedState !== state) {
    return fail("bad_state");
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    return fail("not_configured");
  }

  const user = await getCurrentUser();
  if (!user) {
    return fail("login_required");
  }

  // 1) Exchange the code for a short-lived token (server-to-server,
  // form-encoded). Valid ~1 hour — exchanged for a long-lived token
  // right away, never stored.
  let shortToken: ShortTokenResponse;
  try {
    const res = await fetch(SHORT_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: INSTAGRAM_REDIRECT_URI,
        code,
      }),
    });
    if (!res.ok) {
      console.error("Instagram token exchange failed:", res.status);
      return fail("exchange_failed");
    }
    shortToken = (await res.json()) as ShortTokenResponse;
  } catch (err) {
    console.error("Instagram token exchange error:", err);
    return fail("exchange_failed");
  }
  if (!shortToken.access_token || !shortToken.user_id) {
    return fail("exchange_failed");
  }

  // 2) Exchange the short-lived token for a 60-day long-lived one.
  let longToken: LongTokenResponse;
  try {
    const exchange = new URL(LONG_TOKEN_URL);
    exchange.searchParams.set("grant_type", "ig_exchange_token");
    exchange.searchParams.set("client_secret", appSecret);
    exchange.searchParams.set("access_token", shortToken.access_token);
    const res = await fetch(exchange.toString());
    if (!res.ok) {
      console.error("Instagram long-lived exchange failed:", res.status);
      return fail("exchange_failed");
    }
    longToken = (await res.json()) as LongTokenResponse;
  } catch (err) {
    console.error("Instagram long-lived exchange error:", err);
    return fail("exchange_failed");
  }
  if (!longToken.access_token) {
    return fail("exchange_failed");
  }
  const accessToken = longToken.access_token;

  // 3) Fetch the creator's Instagram profile. Without an ig user
  // id there is nothing to save — the connect cannot work.
  let me: MeResponse | undefined;
  try {
    const res = await fetch(`${ME_URL}&access_token=${accessToken}`);
    if (!res.ok) {
      console.error("Instagram /me failed:", res.status);
      return fail("no_account");
    }
    me = (await res.json()) as MeResponse;
  } catch (err) {
    console.error("Instagram /me error:", err);
    return fail("no_account");
  }
  const igUserId = me?.id ?? String(shortToken.user_id);
  if (!igUserId) {
    return fail("no_account");
  }

  // 4) Save the connection. Tokens are stored ENCRYPTED (AES-256-GCM,
  // ENCRYPTION_KEY) — the 3-hour view-refresh job reads them through a
  // SECURITY DEFINER function without a user session, so the database
  // must only ever hold ciphertext. Migration 0045 must be applied
  // first; if the table is missing the upsert fails and we report it
  // instead of pretending the connect worked.
  const supabase = getServerClient();
  if (!supabase) {
    return fail("not_configured");
  }
  const now = Date.now();
  const { error: saveError } = await supabase
    .from("instagram_connections")
    .upsert(
      {
        user_id: user.id,
        ig_user_id: igUserId,
        username: me?.username ?? null,
        account_type: me?.account_type ?? null,
        access_token: encryptToken(accessToken),
        scope: INSTAGRAM_SCOPES,
        token_expires_at: longToken.expires_in
          ? new Date(now + longToken.expires_in * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,ig_user_id" }
    );
  if (saveError) {
    console.error("Saving Instagram connection failed:", saveError.message);
    return fail("save_failed");
  }

  const response = NextResponse.redirect(
    new URL("/connect?instagram=connected", SITE_URL)
  );
  response.cookies.delete(STATE_COOKIE);
  return response;
}
