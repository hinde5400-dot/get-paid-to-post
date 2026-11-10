// TikTok view counts — Login Kit + video.list scope (Display API).
//
// A creator's own videos are read with THEIR access token (saved
// encrypted in tiktok_connections). Access tokens live 24h, refresh
// tokens 365 days — an expired access token is refreshed here before
// the lookup, and the new tokens are saved back encrypted.
//
// video/query takes the video ID straight from the submitted link, so
// no video list has to be paged through. If it ever fails, video/list
// is the fallback (match by video ID or share URL). Both endpoints
// need the video.list scope granted at connect time.
// NOTE: while the TikTok app is "In review", only the sandbox target
// user can connect — the code is generic and works for every creator
// once the app is approved and Production credentials are restored.

const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const VIDEO_QUERY_URL =
  "https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,create_time";
const VIDEO_LIST_URL =
  "https://open.tiktokapis.com/v2/video/list/?fields=id,share_url,view_count,like_count,comment_count,create_time";

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string | null;
  refreshExpiresAt: string | null;
}

export function extractTikTokVideoId(rawUrl: string): string | null {
  const match = rawUrl.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}

import { resolveRedirectUrl } from "../canonical-url";

/** Resolve a vm.tiktok.com short link to its full URL (best effort).
 *  Shared logic lives in @/lib/canonical-url — any failure keeps
 *  the submitted URL (5s timeout, never blocks the caller). */
async function resolveShortLink(rawUrl: string): Promise<string> {
  try {
    const host = new URL(
      /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`
    ).hostname.toLowerCase();
    if (host !== "vm.tiktok.com") return rawUrl;
    return resolveRedirectUrl(rawUrl);
  } catch {
    return rawUrl;
  }
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
}

async function refreshAccessToken(
  refreshToken: string
): Promise<TikTokTokens | null> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret || !refreshToken) return null;
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
  } catch (err) {
    console.error("TikTok token refresh request failed:", err);
    return null;
  }
  if (!res.ok) {
    console.error("TikTok token refresh failed:", res.status);
    return null;
  }
  const token = (await res.json()) as TokenResponse;
  if (!token.access_token) return null;
  const now = Date.now();
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? refreshToken,
    tokenExpiresAt: token.expires_in
      ? new Date(now + token.expires_in * 1000).toISOString()
      : null,
    refreshExpiresAt: token.refresh_expires_in
      ? new Date(now + token.refresh_expires_in * 1000).toISOString()
      : null,
  };
}

/** Views + engagement counts for one video. likes/comments may be
 *  absent from the API response — the caller falls back to the
 *  stored counts rather than zeroing them. postedAt is when the
 *  video itself was posted (create_time, unix seconds), for the
 *  30-minute submit rule — null when TikTok does not return one. */
export interface TikTokVideoStats {
  views: number;
  likes: number | null;
  comments: number | null;
  postedAt: string | null;
}

/** create_time (unix seconds) → ISO string, or null. */
function postedAtFrom(createTime: unknown): string | null {
  if (typeof createTime !== "number" || !Number.isFinite(createTime)) return null;
  const ms = createTime * 1000;
  if (ms <= 0) return null;
  return new Date(ms).toISOString();
}

async function queryVideoViews(
  accessToken: string,
  videoId: string
): Promise<TikTokVideoStats | null> {
  let res: Response;
  try {
    res = await fetch(VIDEO_QUERY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filters: { video_ids: [videoId] } }),
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    console.error("TikTok video/query failed:", res.status);
    return null;
  }
  const data = (await res.json()) as {
    data?: {
      videos?: {
        id?: string;
        view_count?: number;
        like_count?: number;
        comment_count?: number;
        create_time?: number;
      }[];
    };
  };
  const video = data?.data?.videos?.find((v) => v.id === videoId);
  if (typeof video?.view_count !== "number") return null;
  return {
    views: video.view_count,
    likes: typeof video.like_count === "number" ? video.like_count : null,
    comments:
      typeof video.comment_count === "number" ? video.comment_count : null,
    postedAt: postedAtFrom(video.create_time),
  };
}

async function listVideoViews(
  accessToken: string,
  videoId: string
): Promise<TikTokVideoStats | null> {
  let cursor = 0;
  for (let page = 0; page < 5; page++) {
    let res: Response;
    try {
      res = await fetch(VIDEO_LIST_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ max_count: 20, cursor }),
      });
    } catch {
      return null;
    }
    if (!res.ok) {
      console.error("TikTok video/list failed:", res.status);
      return null;
    }
    const data = (await res.json()) as {
      data?: {
        videos?: {
          id?: string;
          share_url?: string;
          view_count?: number;
          like_count?: number;
          comment_count?: number;
          create_time?: number;
        }[];
        cursor?: number;
        has_more?: boolean;
      };
    };
    const videos = data?.data?.videos ?? [];
    const match = videos.find(
      (v) => v.id === videoId || (v.share_url ?? "").includes(videoId)
    );
    if (match && typeof match.view_count === "number") {
      return {
        views: match.view_count,
        likes: typeof match.like_count === "number" ? match.like_count : null,
        comments:
          typeof match.comment_count === "number" ? match.comment_count : null,
        postedAt: postedAtFrom(match.create_time),
      };
    }
    if (!data?.data?.has_more) return null;
    cursor = data.data.cursor ?? 0;
  }
  return null;
}

export type TikTokViewResult =
  | {
      views: number;
      likes: number | null;
      comments: number | null;
      /** When the video itself was posted (create_time) — null
       *  when TikTok does not return one. 30-minute submit rule. */
      postedAt: string | null;
      tokens?: TikTokTokens;
    }
  | { error: string; tokens?: TikTokTokens };

/**
 * Read one TikTok video's view count plus its like and comment
 * counts (for the 1% engagement minimum — likes + comments only).
 * Refreshes the access token first when it is expired (or about
 * to), and returns the new tokens so the caller can save them back
 * encrypted.
 */
export async function fetchTikTokViews(
  postUrl: string,
  tokens: TikTokTokens
): Promise<TikTokViewResult> {
  let accessToken = tokens.accessToken;
  let freshTokens: TikTokTokens | undefined;
  const expiresAt = tokens.tokenExpiresAt
    ? new Date(tokens.tokenExpiresAt).getTime()
    : 0;
  if (!accessToken || expiresAt < Date.now() + 60_000) {
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    if (!refreshed) {
      return { error: "TikTok login expired — the creator needs to reconnect." };
    }
    accessToken = refreshed.accessToken;
    freshTokens = refreshed;
  }

  const resolvedUrl = await resolveShortLink(postUrl);
  const videoId = extractTikTokVideoId(resolvedUrl);
  if (!videoId) {
    return {
      error: "Could not read a video ID from this TikTok link.",
      tokens: freshTokens,
    };
  }

  const stats =
    (await queryVideoViews(accessToken, videoId)) ??
    (await listVideoViews(accessToken, videoId));
  if (stats === null) {
    return {
      error: "Video not found in the creator's TikTok account.",
      tokens: freshTokens,
    };
  }
  return {
    views: stats.views,
    likes: stats.likes,
    comments: stats.comments,
    postedAt: stats.postedAt,
    tokens: freshTokens,
  };
}
