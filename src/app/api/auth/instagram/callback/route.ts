import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import {
  SITE_URL,
  INSTAGRAM_REDIRECT_URI,
  INSTAGRAM_SCOPES,
  INSTAGRAM_GRAPH_BASE,
} from "@/lib/constants";
import { encryptToken } from "@/lib/views/crypto";

/**
 * GET /api/auth/instagram/callback — Instagram Login redirect
 * target.
 *
 * This is the exact Redirect URI registered in the Meta app
 * (Unified login configuration): it must match character for
 * character or Meta refuses the login.
 *
 * Unified Login flow (verified live 2026-11-13): the authorize
 * URL is facebook.com/dialog/oauth with config_id, so the code it
 * issues is a FACEBOOK authorization code. Both instagram.com
 * token endpoints reject it with 400 / IGApiException code 190
 * "Invalid OAuth 2.0 Access Token" — the code must be exchanged
 * at the FACEBOOK Graph endpoint instead:
 *
 *   1) GET {graph}/oauth/access_token?client_id&client_secret&
 *      redirect_uri&code — returns a Facebook user access token.
 *      There is NO second ig_exchange_token / fb_exchange_token
 *      hop in the Unified Login flow; the token's lifetime comes
 *      from the login configuration (expires_in may be absent for
 *      a non-expiring token).
 *   2) Discover the shared Instagram account:
 *      GET {graph}/me/assigned_instagram_accounts?fields=id,username
 *      (fallback: /me/accounts → instagram_business_account).
 *   3) Read its profile: GET {graph}/{ig-user-id}?fields=
 *      id,username,account_type.
 *   4) Save the connection in public.instagram_connections
 *      (migration 0045) so later code can read their Reels' view
 *      counts via the Facebook Graph API.
 *
 * Tokens are stored ENCRYPTED (AES-256-GCM, ENCRYPTION_KEY).
 * Every failure redirects to /connect with an instagram= status
 * instead of showing an error page. The App Secret never leaves
 * the server and is never logged (it travels in the exchange
 * query string, which is never written to any log).
 */
export const dynamic = "force-dynamic";

const STATE_COOKIE = "instagram_oauth_state";
const EXCHANGE_URL = `${INSTAGRAM_GRAPH_BASE}/oauth/access_token`;
const ASSIGNED_URL = `${INSTAGRAM_GRAPH_BASE}/me/assigned_instagram_accounts?fields=id,username`;
const PAGES_URL = `${INSTAGRAM_GRAPH_BASE}/me/accounts?fields=instagram_business_account{id,username}`;

function fail(status: string) {
  return NextResponse.redirect(
    new URL(`/connect?instagram=${status}`, SITE_URL)
  );
}

interface ExchangeResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string; type?: string; code?: number };
}

interface AssignedResponse {
  data?: { id?: string; username?: string }[];
  error?: { message?: string; type?: string; code?: number };
}

interface PagesResponse {
  data?: { instagram_business_account?: { id?: string; username?: string } }[];
  error?: { message?: string; type?: string; code?: number };
}

interface ProfileResponse {
  id?: string;
  username?: string;
  account_type?: string;
  error?: { message?: string; type?: string; code?: number };
}

/** Read a Graph error body for the log — error_type/code/message
 *  only, never a token. Returns "" when the body is unreadable. */
async function errorDetail(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "(unreadable)";
  }
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

  // 1) Exchange the Facebook authorization code for a Facebook
  // user access token (server-to-server GET). The token's lifetime
  // comes from the Unified login configuration — expires_in may be
  // absent when the configuration issues a non-expiring token.
  let accessToken: string;
  let expiresIn: number | undefined;
  try {
    const exchange = new URL(EXCHANGE_URL);
    exchange.searchParams.set("client_id", appId);
    exchange.searchParams.set("client_secret", appSecret);
    exchange.searchParams.set("redirect_uri", INSTAGRAM_REDIRECT_URI);
    exchange.searchParams.set("code", code);
    const res = await fetch(exchange.toString());
    if (!res.ok) {
      console.error(
        "Instagram token exchange failed:",
        res.status,
        await errorDetail(res)
      );
      return fail("exchange_failed");
    }
    const payload = (await res.json()) as ExchangeResponse;
    if (!payload.access_token) {
      console.error("Instagram token exchange returned no token");
      return fail("exchange_failed");
    }
    accessToken = payload.access_token;
    expiresIn = payload.expires_in;
  } catch (err) {
    console.error("Instagram token exchange error:", err);
    return fail("exchange_failed");
  }

  // 2) Discover the Instagram account(s) this token can access.
  // The dialog lets the creator pick the account; the token's
  // assigned list reflects that choice. Fall back to the Page
  // route when the assigned list comes back empty (a known Meta
  // quirk with no confirmed fix).
  let igUserId = "";
  let igUsername: string | null = null;
  try {
    const res = await fetch(
      `${ASSIGNED_URL}&access_token=${encodeURIComponent(accessToken)}`
    );
    if (res.ok) {
      const body = (await res.json()) as AssignedResponse;
      const first = (body.data ?? []).find((a) => a.id);
      if (first?.id) {
        igUserId = first.id;
        igUsername = first.username ?? null;
      }
    } else {
      console.error(
        "Instagram assigned accounts failed:",
        res.status,
        await errorDetail(res)
      );
    }
  } catch (err) {
    console.error("Instagram assigned accounts error:", err);
  }
  if (!igUserId) {
    try {
      const res = await fetch(
        `${PAGES_URL}&access_token=${encodeURIComponent(accessToken)}`
      );
      if (res.ok) {
        const body = (await res.json()) as PagesResponse;
        const first = (body.data ?? []).find(
          (p) => p.instagram_business_account?.id
        )?.instagram_business_account;
        if (first?.id) {
          igUserId = first.id;
          igUsername = first.username ?? null;
        }
      } else {
        console.error(
          "Instagram pages accounts failed:",
          res.status,
          await errorDetail(res)
        );
      }
    } catch (err) {
      console.error("Instagram pages accounts error:", err);
    }
  }
  if (!igUserId) {
    return fail("no_account");
  }

  // 3) Read the account's profile. If the profile call fails,
  // keep the discovery values (id + username) instead of
  // failing the whole connect.
  let username = igUsername;
  let accountType: string | null = null;
  try {
    const res = await fetch(
      `${INSTAGRAM_GRAPH_BASE}/${igUserId}?fields=id,username,account_type&access_token=${encodeURIComponent(accessToken)}`
    );
    if (res.ok) {
      const profile = (await res.json()) as ProfileResponse;
      if (profile.username) username = profile.username;
      if (profile.account_type) accountType = profile.account_type;
    } else {
      console.error(
        "Instagram profile failed:",
        res.status,
        await errorDetail(res)
      );
    }
  } catch (err) {
    console.error("Instagram profile error:", err);
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
        username,
        account_type: accountType,
        access_token: encryptToken(accessToken),
        scope: INSTAGRAM_SCOPES,
        token_expires_at:
          typeof expiresIn === "number" && expiresIn > 0
            ? new Date(now + expiresIn * 1000).toISOString()
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
