// YouTube view counts — YouTube Data API v3 (API key only).
//
// No OAuth is needed: a creator's public video view count is public
// data, so a pasted link is enough. One videos.list call costs 1
// quota unit (10,000 free units/day). The API key lives in the
// Vercel env var YOUTUBE_API_KEY (Production) and never leaves the
// server — it is never logged, and never put in a URL the browser sees.

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

export async function fetchYouTubeViews(
  postUrl: string
): Promise<YouTubeResult> {
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
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(
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
    items?: { statistics?: { viewCount?: string } }[];
  };
  const item = data?.items?.[0];
  const views = Number(item?.statistics?.viewCount ?? NaN);
  if (!item || Number.isNaN(views)) {
    return { error: "Video not found or not public." };
  }
  return { views };
}
