import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import { SITE_URL, TIKTOK_REDIRECT_URI, TIKTOK_SCOPES } from "@/lib/constants";
import { encryptToken } from "@/lib/views/crypto";

/**
 * GET /api/auth/tiktok/callback — TikTok Login Kit redirect target.
 *
 * This is the exact Redirect URI registered in the TikTok Developer
 * app (Step 5 of the TikTok setup): it must match character for
 * character or TikTok refuses the login.
 *
 * Flow: verify `state` against the cookie set by /api/auth/tiktok,
 * exchange the one-time `code` server-side for an access + refresh
 * token (POST https://open.tiktokapis.com/v2/oauth/token/),
 * fetch the creator's TikTok profile (GET /v2/user/info/), then save
 * the connection in public.tiktok_connections (migration 0016) so
 * later code can read their videos' view counts via the Display API.
 *
 * Tokens live 24h (access) / 365d (refresh) — a refresh job is still
 * TODO before live view-syncing. Nothing here is deployed or run
 * until the migration is applied and the Vercel env vars are set;
 * every failure redirects to /connect with a tiktok= status instead
 * of showing an error page. The Client Secret never leaves the
 * server and is never logged.
 */
export const dynamic = "force-dynamic";

const STATE_COOKIE = "tiktok_oauth_state";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL =
  "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username";

function fail(status: string) {
  return NextResponse.redirect(new URL(`/connect?tiktok=${status}`, SITE_URL));
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  scope?: string;
  expires_in?: number;
  refresh_expires_in?: number;
}

interface TikTokUser {
  open_id?: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
  username?: string;
}

interface UserInfoResponse {
  data?: {
    user?: TikTokUser;
  };
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

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    return fail("not_configured");
  }

  const user = await getCurrentUser();
  if (!user) {
    return fail("login_required");
  }

  // 1) Exchange the code for tokens (server-to-server, form-encoded).
  let token: TokenResponse;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: TIKTOK_REDIRECT_URI,
      }),
    });
    if (!res.ok) {
      console.error("TikTok token exchange failed:", res.status);
      return fail("exchange_failed");
    }
    token = (await res.json()) as TokenResponse;
  } catch (err) {
    console.error("TikTok token exchange error:", err);
    return fail("exchange_failed");
  }
  if (!token.access_token || !token.open_id) {
    return fail("exchange_failed");
  }

  // 2) Fetch the creator's TikTok profile. If this fails we still
  // save the tokens (open_id comes from the token response) — the
  // display name can be filled in on the next refresh.
  let profile: TikTokUser | undefined;
  try {
    const res = await fetch(USER_INFO_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (res.ok) {
      const info = (await res.json()) as UserInfoResponse;
      profile = info.data?.user;
    } else {
      console.error("TikTok user/info failed:", res.status);
    }
  } catch (err) {
    console.error("TikTok user/info error:", err);
  }

  // 3) Save the connection. Tokens are stored ENCRYPTED (AES-256-GCM,
  // ENCRYPTION_KEY) — the 3-hour view-refresh job reads them through a
  // SECURITY DEFINER function without a user session, so the database
  // must only ever hold ciphertext. Migration 0016 must be applied
  // first; if the table is missing the upsert fails and we report it
  // instead of pretending the connect worked.
  const supabase = getServerClient();
  if (!supabase) {
    return fail("not_configured");
  }
  const now = Date.now();
  const { error: saveError } = await supabase
    .from("tiktok_connections")
    .upsert(
      {
        user_id: user.id,
        open_id: token.open_id,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        access_token: encryptToken(token.access_token),
        refresh_token: token.refresh_token
          ? encryptToken(token.refresh_token)
          : "",
        scope: token.scope ?? TIKTOK_SCOPES,
        token_expires_at: token.expires_in
          ? new Date(now + token.expires_in * 1000).toISOString()
          : null,
        refresh_expires_at: token.refresh_expires_in
          ? new Date(now + token.refresh_expires_in * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,open_id" }
    );
  if (saveError) {
    console.error("Saving TikTok connection failed:", saveError.message);
    return fail("save_failed");
  }

  const response = NextResponse.redirect(
    new URL("/connect?tiktok=connected", SITE_URL)
  );
  response.cookies.delete(STATE_COOKIE);
  return response;
}
