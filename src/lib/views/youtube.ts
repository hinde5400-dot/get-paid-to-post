// YouTube view counts — YouTube Data API v3 (API key only).
//
// A pasted link alone is NOT enough to count views: anyone could
// paste any viral video's link. Since 2026-11-09 a YouTube
// submission only counts when the video's channelId matches the
// creator's CONNECTED channel (Google OAuth, youtube.readonly —
// see /api/auth/youtube). The API key still fetches the public
// view count; the OAuth connection proves who owns the video.
// One videos.list call costs 1 quota unit (10,000 free units/day).
// The API key lives in the Vercel env var YOUTUBE_API_KEY
// (Production) and never leaves the server — it is never logged,
// and never put in a URL the browser sees.

export function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const trimmed = rawUrl.trim();
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ?? null;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") &&
        parts[1]
      ) {
        return parts[1];
      }
    }
    return null;
  } catch {
    return null;
  }
}

type YouTubeResult = { views: number } | { error: string };

type YouTubeVideoResult =
  | { views: number; channelId: string; channelTitle: string }
  | { error: string };

/**
 * Fetch a video's public view count AND the channel that owns it.
 * The channelId is what stops the viral-link scam: a submission is
 * only accepted when this channel matches the creator's CONNECTED
 * YouTube channel (see /api/submissions and the refresh job). One
 * videos.list call costs 1 quota unit (10,000 free units/day).
 */
export async function fetchYouTubeVideoDetails(
  postUrl: string
): Promise<YouTubeVideoResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return { error: "YouTube API key is not set up yet." };
  }
  const videoId = extractYouTubeVideoId(postUrl);
  if (!videoId) {
    return { error: "Could not read a video ID from this YouTube link." };
  }
  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${encodeURIComponent(
        videoId
      )}&key=${apiKey}`,
      { cache: "no-store" }
    );
  } catch (err) {
    console.error("YouTube API request failed:", err);
    return { error: "Could not reach YouTube." };
  }
  if (!res.ok) {
    console.error("YouTube API error:", res.status);
    return { error: `YouTube API error (${res.status}).` };
  }
  const data = (await res.json()) as {
    items?: {
      statistics?: { viewCount?: string };
      snippet?: { channelId?: string; channelTitle?: string };
    }[];
  };
  const item = data?.items?.[0];
  const views = Number(item?.statistics?.viewCount ?? NaN);
  const channelId = item?.snippet?.channelId;
  if (!item || Number.isNaN(views) || !channelId) {
    return { error: "Video not found or not public." };
  }
  return { views, channelId, channelTitle: item.snippet?.channelTitle ?? "" };
}

export async function fetchYouTubeViews(
  postUrl: string
): Promise<YouTubeResult> {
  const result = await fetchYouTubeVideoDetails(postUrl);
  if ("error" in result) return { error: result.error };
  return { views: result.views };
}
