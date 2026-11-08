// Google OAuth token refresh for the connected YouTube channel.
//
// The access token from Google lasts 1 hour; the refresh token
// (requested with access_type=offline + prompt=consent) lasts until
// the creator disconnects or revokes it. Only the /connect profile
// re-read needs a fresh token — the 3-hour view refresh compares
// channel ids with the public API key and never touches OAuth
// tokens. Client ID / Secret come from the Vercel env vars
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (Google Cloud OAuth
// client) and never leave the server.

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface RefreshedYouTubeTokens {
  accessToken: string;
  tokenExpiresAt: string | null;
}

/** Exchange a refresh token for a new access token. Null on failure. */
export async function refreshYouTubeAccessToken(
  refreshToken: string
): Promise<RefreshedYouTubeTokens | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !refreshToken) return null;
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch (err) {
    console.error("YouTube token refresh request failed:", err);
    return null;
  }
  if (!res.ok) {
    console.error("YouTube token refresh failed:", res.status);
    return null;
  }
  const token = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!token.access_token) return null;
  return {
    accessToken: token.access_token,
    tokenExpiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null,
  };
}
