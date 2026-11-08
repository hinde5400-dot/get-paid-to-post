import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import {
  SITE_URL,
  YOUTUBE_OAUTH_REDIRECT_URI,
  YOUTUBE_OAUTH_SCOPES,
} from "@/lib/constants";
import { encryptToken } from "@/lib/views/crypto";

/**
 * GET /api/auth/youtube/callback — Google OAuth redirect target.
 *
 * This is the exact Redirect URI registered in the Google Cloud
 * OAuth client: it must match character for character or Google
 * refuses the login.
 *
 * Flow: verify `state` against the cookie set by /api/auth/youtube,
 * exchange the one-time `code` server-side for an access + refresh
 * token (POST https://oauth2.googleapis.com/token), fetch the
 * creator's own channel (GET /youtube/v3/channels?part=snippet&
 * mine=true), then save the connection in public.youtube_connections
 * (migration 0019) so later code can prove a submitted YouTube
 * video belongs to this creator.
 *
 * The scope is youtube.readonly — Google only ever lets the site
 * READ the channel's own data. Tokens live ~1h (access) until
 * revoked (refresh, requested with access_type=offline). Every
 * failure redirects to /connect with a youtube= status instead of
 * showing an error page. The Client Secret never leaves the server
 * and is never logged.
 */
export const dynamic = "force-dynamic";

const STATE_COOKIE = "youtube_oauth_state";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHANNELS_URL =
  "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";

function fail(status: string) {
  return NextResponse.redirect(new URL(`/connect?youtube=${status}`, SITE_URL));
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
}

interface ChannelResponse {
  items?: {
    id?: string;
    snippet?: {
      title?: string;
      customUrl?: string;
    };
  }[];
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

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return fail("not_configured");
  }

  const user = await getCurrentUser();
  if (!user) {
    return fail("login_required");
  }

  // 1) Exchange the code for tokens (server-to-server).
  let token: TokenResponse;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: YOUTUBE_OAUTH_REDIRECT_URI,
      }),
    });
    if (!res.ok) {
      console.error("YouTube token exchange failed:", res.status);
      return fail("exchange_failed");
    }
    token = (await res.json()) as TokenResponse;
  } catch (err) {
    console.error("YouTube token exchange error:", err);
    return fail("exchange_failed");
  }
  if (!token.access_token) {
    return fail("exchange_failed");
  }

  // 2) Fetch the creator's own channel. Without a channel id there
  // is nothing to save — the connect cannot work.
  let channelId: string | undefined;
  let channelTitle: string | undefined;
  let channelHandle: string | undefined;
  try {
    const res = await fetch(CHANNELS_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!res.ok) {
      console.error("YouTube channels.list failed:", res.status);
      return fail("no_channel");
    }
    const data = (await res.json()) as ChannelResponse;
    const channel = data.items?.[0];
    channelId = channel?.id;
    channelTitle = channel?.snippet?.title;
    channelHandle = channel?.snippet?.customUrl;
  } catch (err) {
    console.error("YouTube channels.list error:", err);
    return fail("no_channel");
  }
  if (!channelId) {
    return fail("no_channel");
  }

  // 3) Save the connection. Tokens are stored ENCRYPTED (AES-256-GCM,
  // ENCRYPTION_KEY) — the database must only ever hold ciphertext.
  // Migration 0019 must be applied first; if the table is missing
  // the upsert fails and we report it instead of pretending the
  // connect worked.
  const supabase = getServerClient();
  if (!supabase) {
    return fail("not_configured");
  }
  const now = Date.now();
  const { error: saveError } = await supabase
    .from("youtube_connections")
    .upsert(
      {
        user_id: user.id,
        channel_id: channelId,
        channel_title: channelTitle ?? null,
        channel_handle: channelHandle ?? null,
        access_token: encryptToken(token.access_token),
        refresh_token: token.refresh_token
          ? encryptToken(token.refresh_token)
          : "",
        scope: token.scope ?? YOUTUBE_OAUTH_SCOPES,
        token_expires_at: token.expires_in
          ? new Date(now + token.expires_in * 1000).toISOString()
          : null,
        refresh_expires_at: null, // Google refresh tokens do not expire on a fixed date.
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,channel_id" }
    );
  if (saveError) {
    console.error("Saving YouTube connection failed:", saveError.message);
    return fail("save_failed");
  }

  const response = NextResponse.redirect(
    new URL("/connect?youtube=connected", SITE_URL)
  );
  response.cookies.delete(STATE_COOKIE);
  return response;
}
