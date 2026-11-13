// Instagram view counts — Meta app "Get Paid To Post" (App ID
// 1433209415104875, Unified login / Instagram API with Instagram
// Login).
//
// Unified Login runs on the FACEBOOK Graph API: the dialog issues
// a Facebook authorization code, exchanged at
// {graph}/oauth/access_token for a Facebook user access token, and
// media/insights are read at {graph}/{ig-user-id}/media and
// {graph}/{media-id}/insights. (Proven live 2026-11-13: both
// instagram.com token endpoints reject the Facebook code with 400
// / IGApiException code 190 "Invalid OAuth 2.0 Access Token".)
//
// A creator's own Reels are read with THEIR access token (saved
// encrypted in instagram_connections). The token's lifetime comes
// from the Unified login configuration — it may be non-expiring
// (token_expires_at null), in which case no refresh is attempted;
// an expiring token is refreshed inside its last 7 days via the
// Facebook fb_exchange_token flow, and the new token is saved
// back encrypted.
//
// How a Reel is found: the Graph API has no "look up one Reel by
// URL" call, so /{ig-user-id}/media is paged through (newest
// first) and the media whose permalink contains the Reel's
// shortcode is the match. A match IS the ownership proof — the
// list only ever returns the connected account's own media, so a
// Reel that is not in the list is not the creator's. Views come
// from the media's `views` insight; likes/comments come from the
// media node itself.
//
// NOTE: while the Meta app is in Development mode, only Instagram
// Testers can connect — the code is generic and works for every
// creator once the app passes App Review.

import { INSTAGRAM_GRAPH_BASE } from "@/lib/constants";

const GRAPH_BASE = INSTAGRAM_GRAPH_BASE;

export interface InstagramTokens {
  accessToken: string;
  igUserId: string;
  tokenExpiresAt: string | null;
}

/** Shortcode from an instagram.com/reel/<code> or /p/<code> link. */
export function extractInstagramShortcode(rawUrl: string): string | null {
  const match = rawUrl.match(/\/(?:reel|reels|p)\/([^/?#]+)/);
  return match ? match[1] : null;
}

interface LongLivedTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

/** Refresh an expiring Facebook user access token (60-day
 *  fb_exchange_token flow). Returns the new token + expiry, or
 *  null when Meta refuses (e.g. the token is already expired —
 *  the creator must reconnect). A token must be at least 24h old
 *  before Meta lets it refresh; callers only refresh when expiry
 *  is < 7 days away, so the token is always old enough by then. */
async function refreshAccessToken(
  accessToken: string
): Promise<InstagramTokens | null> {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    console.error("Instagram token refresh: app not configured");
    return null;
  }
  let res: Response;
  try {
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("fb_exchange_token", accessToken);
    res = await fetch(url.toString());
  } catch (err) {
    console.error("Instagram token refresh request failed:", err);
    return null;
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      detail = "(unreadable)";
    }
    console.error("Instagram token refresh failed:", res.status, detail);
    return null;
  }
  const token = (await res.json()) as LongLivedTokenResponse;
  if (!token.access_token) return null;
  const now = Date.now();
  return {
    // igUserId is filled in by the caller — a refresh never
    // changes which Instagram account the token belongs to.
    accessToken: token.access_token,
    igUserId: "",
    tokenExpiresAt: token.expires_in
      ? new Date(now + token.expires_in * 1000).toISOString()
      : null,
  };
}

/** Views + engagement counts for one Reel. likes/comments may be
 *  absent from the API response — the caller falls back to the
 *  stored counts rather than zeroing them. postedAt is when the
 *  Reel itself was posted (media timestamp), for the 30-minute
 *  submit rule — null when Meta does not return one. */
export interface InstagramMediaStats {
  views: number;
  likes: number | null;
  comments: number | null;
  postedAt: string | null;
}

interface MediaNode {
  id?: string;
  media_type?: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
}

interface MediaListResponse {
  data?: MediaNode[];
  paging?: { cursors?: { after?: string } };
}

interface InsightsResponse {
  data?: { name?: string; values?: { value?: number }[] }[];
}

/**
 * Find the creator's own media whose permalink holds the Reel's
 * shortcode. "not found" (the Reel is not in the connected
 * account) vs "unavailable" (Meta could not be reached) must stay
 * distinct — never report a transient failure as "not yours".
 */
type MediaOutcome =
  | { media: MediaNode }
  | { notFound: true }
  | { unavailable: true };

async function findOwnMedia(
  accessToken: string,
  igUserId: string,
  shortcode: string
): Promise<MediaOutcome> {
  let after: string | undefined;
  // 3 pages × 50 media ≈ the creator's recent Reels; a Reel older
  // than that is not inside the 14-day tracking window anyway.
  for (let page = 0; page < 3; page++) {
    let res: Response;
    try {
      const url = new URL(
        `${GRAPH_BASE}/${igUserId}/media?fields=id,media_type,permalink,like_count,comments_count,timestamp&limit=50`
      );
      url.searchParams.set("access_token", accessToken);
      if (after) url.searchParams.set("after", after);
      res = await fetch(url.toString());
    } catch {
      return { unavailable: true };
    }
    if (!res.ok) {
      console.error("Instagram /media failed:", res.status);
      return { unavailable: true };
    }
    const data = (await res.json()) as MediaListResponse;
    const match = (data?.data ?? []).find((m) =>
      (m.permalink ?? "").includes(`/${shortcode}/`)
    );
    if (match) return { media: match };
    after = data?.paging?.cursors?.after;
    if (!after) return { notFound: true };
  }
  return { notFound: true };
}

/** The `views` insight for one media id, or null when Meta does
 *  not return it (wrong media type, or the insight is not
 *  available for this account). */
async function fetchMediaViews(
  accessToken: string,
  mediaId: string
): Promise<number | null> {
  let res: Response;
  try {
    const url = new URL(`${GRAPH_BASE}/${mediaId}/insights`);
    url.searchParams.set("metric", "views");
    url.searchParams.set("access_token", accessToken);
    res = await fetch(url.toString());
  } catch {
    return null;
  }
  if (!res.ok) {
    console.error("Instagram media insights failed:", res.status);
    return null;
  }
  const data = (await res.json()) as InsightsResponse;
  const views = data?.data?.find((d) => d.name === "views")?.values?.[0]
    ?.value;
  return typeof views === "number" ? views : null;
}

export type InstagramViewResult =
  | {
      views: number;
      likes: number | null;
      comments: number | null;
      /** When the Reel itself was posted (media timestamp) — null
       *  when Meta does not return one. 30-minute submit rule. */
      postedAt: string | null;
      tokens?: InstagramTokens;
    }
  | { error: string; tokens?: InstagramTokens };

/**
 * Read one Reel's view count plus its like and comment counts
 * (for the 1% engagement minimum — likes + comments only).
 * Refreshes the access token first when it expires within 7 days
 * (a null expiry means the configuration issued a non-expiring
 * token — nothing to refresh), and returns the new token so the
 * caller can save it back encrypted.
 */
export async function fetchInstagramViews(
  postUrl: string,
  tokens: InstagramTokens
): Promise<InstagramViewResult> {
  let accessToken = tokens.accessToken;
  let freshTokens: InstagramTokens | undefined;
  const expiresAt = tokens.tokenExpiresAt
    ? new Date(tokens.tokenExpiresAt).getTime()
    : 0;
  // Refresh early (7-day window) — but only for expiring tokens.
  // A null expiry is a non-expiring token: no refresh exists for
  // it and none is needed.
  if (
    tokens.tokenExpiresAt &&
    expiresAt < Date.now() + 7 * 24 * 60 * 60 * 1000
  ) {
    const refreshed = await refreshAccessToken(accessToken);
    if (!refreshed) {
      return {
        error: "Instagram login expired — the creator needs to reconnect.",
      };
    }
    accessToken = refreshed.accessToken;
    freshTokens = { ...refreshed, igUserId: tokens.igUserId };
  }

  const shortcode = extractInstagramShortcode(postUrl);
  if (!shortcode) {
    return {
      error: "Could not read a Reel ID from this Instagram link.",
      tokens: freshTokens,
    };
  }

  const found = await findOwnMedia(accessToken, tokens.igUserId, shortcode);
  if ("unavailable" in found) {
    return {
      error: "Instagram could not be reached right now.",
      tokens: freshTokens,
    };
  }
  if ("notFound" in found) {
    return {
      error: "Reel not found in the creator's Instagram account.",
      tokens: freshTokens,
    };
  }
  const media = found.media;
  const views = await fetchMediaViews(accessToken, media.id ?? "");
  if (views === null) {
    return {
      error: "Could not read views for this Reel.",
      tokens: freshTokens,
    };
  }
  return {
    views,
    likes: typeof media.like_count === "number" ? media.like_count : null,
    comments:
      typeof media.comments_count === "number" ? media.comments_count : null,
    postedAt: media.timestamp ?? null,
    tokens: freshTokens,
  };
}
