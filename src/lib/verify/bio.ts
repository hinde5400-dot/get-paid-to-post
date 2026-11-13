// Bio-code profile verification — server-side PUBLIC reads.
//
// Turn's decision (2026-11-13, final): no API approval, no login,
// no business registration, NO screenshot/manual path at all. A
// creator pastes a profile link, the site gives a unique code
// (GPTP-XXXXXX), the creator writes it in their bio, waits 2
// minutes, clicks Verify, and the SERVER fetches the public
// profile page and checks the code is really there. All three
// platforms verify AUTOMATICALLY, the same way.
//
// What actually works from a server (tested live 2026-11-13):
// - YouTube: channels.list with the API key reads the channel
//   description (the bio) reliably — 1 quota unit, no OAuth.
// - TikTok: the profile page is a JS shell; the bio ("signature")
//   sometimes rides in the __UNIVERSAL_DATA_FOR_REHYDRATION__
//   blob, often not, from a datacenter IP.
// - Instagram: the profile page is a JS shell with no bio in the
//   HTML; web_profile_info needs a warmed session and usually
//   answers 429.
//
// So TikTok / Instagram fetches RETRY server-side (3 attempts,
// short waits — Turn's order). When the bio still cannot be read,
// the verify route tells the creator plainly to wait 2 minutes
// and click Verify again. A failed read is NEVER treated as "code
// not found", and never as verified.
//
// Retries are budgeted for the Vercel Hobby 10-second function
// limit: 3 attempts × 2s timeout + 2 × 1s waits = 8s worst case,
// plus ~0.5s of route overhead.
//
// The same rule applies to public view counts (fetchPublicPostViews):
// try the public page first, fall back to the existing OAuth/manual
// paths when it cannot be read.

import { randomInt } from "crypto";
import type { Platform } from "../types";
import { fetchYouTubeVideoDetails } from "../views/youtube";

/** Code format: GPTP- + 6 digits (Turn's example: "get paid-849201"). */
export const BIO_CODE_PREFIX = "GPTP";
/** How long an issued code stays usable. */
export const BIO_CODE_EXPIRY_MINUTES = 30;
/** How long the creator waits after adding the code before Verify
 *  unlocks in the UI (Turn's order: 2-minute timer). */
export const BIO_VERIFY_WAIT_SECONDS = 120;

export function generateBioCode(): string {
  const digits = String(randomInt(100000, 1000000));
  return `${BIO_CODE_PREFIX}-${digits}`;
}

/**
 * Does the bio contain the code? Normalised (lowercase, all
 * non-alphanumerics stripped) so "GPTP-849201", "gptp 849201" and
 * "GPTP849201" all match — creators type it however fits.
 */
export function codeInBio(
  bio: string | null | undefined,
  code: string
): boolean {
  if (!bio || !code) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return norm(bio).includes(norm(code));
}

/** A parsed profile link: the handle that identifies the profile. */
export type ParsedProfileLink =
  | { handle: string; channelId?: string }
  | { error: string };

/**
 * Parse + validate a creator's profile link for a platform.
 * - TikTok: tiktok.com/@handle (a video or share link is not a profile link).
 * - Instagram: instagram.com/handle (a Reel/post link is not a profile link).
 * - YouTube: youtube.com/@handle or youtube.com/channel/UC… (a
 *   video/Shorts link is not a profile link; /c/ and /user/ legacy
 *   links are refused with a message pointing at the @handle link).
 * Handles are lowercased without the @. A /channel/ link becomes
 * handle "uc:<id>" with channelId set.
 */
export function parseProfileLink(
  platform: Platform,
  rawUrl: string
): ParsedProfileLink {
  let u: URL;
  try {
    const trimmed = rawUrl.trim();
    u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { error: "That link could not be read — paste the full profile link." };
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const segs = u.pathname.split("/").filter(Boolean);

  if (platform === "tiktok") {
    if (host !== "tiktok.com") {
      return { error: "That is not a TikTok profile link — paste a tiktok.com/@handle link." };
    }
    if (segs.length !== 1 || !segs[0].startsWith("@")) {
      return { error: "Paste your TikTok PROFILE link (tiktok.com/@handle), not a video link." };
    }
    const handle = segs[0].slice(1).toLowerCase();
    if (!handle) return { error: "That TikTok profile link has no username." };
    return { handle };
  }

  if (platform === "instagram") {
    if (host !== "instagram.com") {
      return { error: "That is not an Instagram profile link — paste an instagram.com/handle link." };
    }
    if (
      segs.length !== 1 ||
      segs[0] === "reel" ||
      segs[0] === "reels" ||
      segs[0] === "p"
    ) {
      return { error: "Paste your Instagram PROFILE link (instagram.com/handle), not a Reel link." };
    }
    return { handle: segs[0].toLowerCase() };
  }

  // YouTube
  if (host !== "youtube.com") {
    return { error: "That is not a YouTube channel link — paste a youtube.com/@handle or youtube.com/channel/… link." };
  }
  if (segs.length === 1 && segs[0].startsWith("@")) {
    const handle = segs[0].slice(1).toLowerCase();
    if (!handle) return { error: "That YouTube channel link has no handle." };
    return { handle };
  }
  if (segs.length === 2 && segs[0] === "channel" && segs[1].startsWith("UC")) {
    return { handle: `uc:${segs[1].toLowerCase()}`, channelId: segs[1] };
  }
  return {
    error:
      "Paste your YouTube channel link as youtube.com/@handle or youtube.com/channel/UC… — a video or Shorts link will not work.",
  };
}

/** Author handle from a TikTok video URL (tiktok.com/@handle/video/<id>). */
export function tiktokHandleFromVideoUrl(raw: string): string | null {
  try {
    const u = new URL(
      /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
    );
    const m = u.pathname.match(/\/@([^/?#]+)/);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

const FETCH_TIMEOUT_MS = 8000;
/** Per-attempt timeout inside the bio retry loop (see the header:
 *  the whole verify must fit the 10-second function limit). */
const BIO_FETCH_TIMEOUT_MS = 2000;
/** Wait between bio retry attempts. */
const BIO_RETRY_WAIT_MS = 1000;
/** Server-side bio read attempts per Verify click (Turn's order). */
const BIO_MAX_ATTEMPTS = 3;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<{ text: string } | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, ...headers },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { text: await res.text() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

/** Walk a parsed JSON tree and return the first string value found
 *  under the given key, or null. Used to pull the bio / counts out
 *  of the platforms' embedded page JSON without depending on the
 *  exact nesting, which changes. */
function findStringDeep(node: unknown, key: string): string | null {
  if (node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findStringDeep(item, key);
      if (found !== null) return found;
    }
    return null;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === key && typeof v === "string") return v;
    const found = findStringDeep(v, key);
    if (found !== null) return found;
  }
  return null;
}

/** Same as findStringDeep, for the first number value under a key. */
function findNumberDeep(node: unknown, key: string): number | null {
  if (node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNumberDeep(item, key);
      if (found !== null) return found;
    }
    return null;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === key && typeof v === "number") return v;
    const found = findNumberDeep(v, key);
    if (found !== null) return found;
  }
  return null;
}

export type BioResult = { bio: string } | { error: string };

/**
 * YouTube channel description (the channel bio) via channels.list
 * with the API key — reliable, 1 quota unit, no OAuth. For a
 * /channel/ link the id lookup is used; for an @handle link the
 * forHandle lookup. Returns the channelId too, so the verify route
 * can lock the profile to the real channel.
 */
export async function fetchYouTubeBio(
  handle: string,
  channelId?: string
): Promise<{ bio: string; channelId: string; channelTitle: string } | { error: string }> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { error: "YouTube API key is not set up yet." };
  const query = channelId
    ? `id=${encodeURIComponent(channelId)}`
    : `forHandle=${encodeURIComponent(`@${handle}`)}`;
  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&${query}&key=${apiKey}`,
      { cache: "no-store" }
    );
  } catch (err) {
    console.warn("YouTube channel bio fetch failed:", err);
    return { error: "Could not reach YouTube." };
  }
  if (!res.ok) {
    console.warn("YouTube channel bio fetch failed: HTTP", res.status);
    return { error: `YouTube API error (${res.status}).` };
  }
  const data = (await res.json()) as {
    items?: { id?: string; snippet?: { title?: string; description?: string } }[];
  };
  const item = data?.items?.[0];
  if (!item?.id) return { error: "Channel not found on YouTube — check the channel link." };
  return {
    bio: item.snippet?.description ?? "",
    channelId: item.id,
    channelTitle: item.snippet?.title ?? "",
  };
}

/**
 * TikTok profile bio ("signature") from the public profile page.
 * Retries server-side (3 attempts, short waits — Turn's order):
 * the page is a JS shell and the signature only rides in the
 * __UNIVERSAL_DATA_FOR_REHYDRATION__ blob when the server
 * renders it — from a datacenter IP it often does not. A missing
 * bio here means "could not read", never "code not found".
 */
export async function fetchTikTokBio(handle: string): Promise<BioResult> {
  for (let attempt = 1; attempt <= BIO_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(BIO_RETRY_WAIT_MS);
    const got = await fetchText(
      `https://www.tiktok.com/@${encodeURIComponent(handle)}`,
      {},
      BIO_FETCH_TIMEOUT_MS
    );
    if ("error" in got) {
      console.warn(
        `TikTok bio fetch failed for @${handle} (attempt ${attempt}):`,
        got.error
      );
      continue;
    }
    const m = got.text.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!m) {
      console.warn(
        `TikTok bio fetch for @${handle}: no rehydration data in page (attempt ${attempt}).`
      );
      continue;
    }
    try {
      const data = JSON.parse(m[1]) as unknown;
      const signature = findStringDeep(data, "signature");
      if (signature === null) {
        console.warn(
          `TikTok bio fetch for @${handle}: no signature in page data (attempt ${attempt}).`
        );
        continue;
      }
      return { bio: signature };
    } catch {
      console.warn(
        `TikTok bio fetch for @${handle}: page data did not parse (attempt ${attempt}).`
      );
      continue;
    }
  }
  return { error: "unreadable" };
}

/** One web_profile_info attempt: the bio string, or null. */
async function fetchInstagramWebProfileBio(
  handle: string
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BIO_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          "X-IG-App-ID": "936619743392459",
        },
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      console.warn(
        `Instagram web_profile_info for @${handle}: HTTP ${res.status}.`
      );
      return null;
    }
    const data = (await res.json()) as {
      data?: { user?: { biography?: string } };
    };
    const bio = data?.data?.user?.biography;
    return typeof bio === "string" ? bio : null;
  } catch (err) {
    console.warn(`Instagram web_profile_info for @${handle} failed:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Instagram profile bio from the public profile page.
 * Retries server-side (3 attempts, short waits — Turn's order):
 * attempt 1 and 3 read the page's embedded JSON, attempt 2 tries
 * web_profile_info. The page is a JS shell with no bio in the
 * HTML, and web_profile_info usually answers 429 from a server
 * IP — so a missing bio means "could not read", never "code not
 * found". The creator is then told to wait 2 minutes and click
 * Verify again.
 */
export async function fetchInstagramBio(handle: string): Promise<BioResult> {
  for (let attempt = 1; attempt <= BIO_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(BIO_RETRY_WAIT_MS);
    if (attempt === 2) {
      const bio = await fetchInstagramWebProfileBio(handle);
      if (bio !== null) return { bio };
      continue;
    }
    const got = await fetchText(
      `https://www.instagram.com/${encodeURIComponent(handle)}/`,
      {},
      BIO_FETCH_TIMEOUT_MS
    );
    if ("error" in got) {
      console.warn(
        `Instagram bio page fetch failed for @${handle} (attempt ${attempt}):`,
        got.error
      );
      continue;
    }
    const m = got.text.match(/"biography":"((?:\\.|[^"\\])*)"/);
    if (!m) {
      console.warn(
        `Instagram bio page for @${handle}: no biography in page (attempt ${attempt}).`
      );
      continue;
    }
    try {
      return { bio: JSON.parse(`"${m[1]}"`) as string };
    } catch {
      console.warn(
        `Instagram bio page for @${handle}: biography did not parse (attempt ${attempt}).`
      );
      continue;
    }
  }
  return { error: "unreadable" };
}

/** Read a public bio for any platform. Never throws. */
export async function fetchProfileBio(
  platform: Platform,
  handle: string,
  channelId?: string
): Promise<BioResult | { bio: string; channelId: string; channelTitle: string }> {
  if (platform === "youtube") return fetchYouTubeBio(handle, channelId);
  if (platform === "tiktok") return fetchTikTokBio(handle);
  return fetchInstagramBio(handle);
}

export type PublicViewsResult =
  | {
      views: number;
      likes: number;
      comments: number;
      postedAt: string | null;
    }
  | { error: string };

/**
 * View counts from the PUBLIC post link first (Turn's order: API
 * is the fallback, not the first try). YouTube keeps using the
 * Data API key — that IS the public fetch, 1 quota unit, no OAuth.
 * TikTok / Instagram parse the public video page's embedded JSON.
 * Best effort, never throws: on any failure the caller falls back
 * to the connected-account API, then to the admin's hand-check.
 */
export async function fetchPublicPostViews(
  platform: Platform,
  postUrl: string
): Promise<PublicViewsResult> {
  if (platform === "youtube") {
    const details = await fetchYouTubeVideoDetails(postUrl);
    if ("error" in details) return { error: details.error };
    return {
      views: details.views,
      likes: details.likes,
      comments: details.comments,
      postedAt: details.publishedAt,
    };
  }

  const got = await fetchText(postUrl, {});
  if ("error" in got) {
    console.warn(`Public views fetch failed for ${postUrl}:`, got.error);
    return { error: "unreadable" };
  }
  const html = got.text;

  if (platform === "tiktok") {
    const m = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!m) return { error: "unreadable" };
    try {
      const data = JSON.parse(m[1]) as unknown;
      const playCount = findNumberDeep(data, "playCount");
      if (playCount === null) return { error: "unreadable" };
      const createTime = findNumberDeep(data, "createTime");
      return {
        views: playCount,
        likes: findNumberDeep(data, "diggCount") ?? 0,
        comments: findNumberDeep(data, "commentCount") ?? 0,
        postedAt:
          createTime !== null
            ? new Date(createTime * 1000).toISOString()
            : null,
      };
    } catch {
      return { error: "unreadable" };
    }
  }

  // Instagram Reel / post page: view + like + comment counts ride
  // in the embedded JSON as plain keys.
  const viewsMatch = html.match(/"video_view_count":(\d+)/);
  if (!viewsMatch) return { error: "unreadable" };
  const likesMatch = html.match(/"edge_media_preview_like":\{"count":(\d+)\}/);
  const commentsMatch = html.match(/"edge_media_to_comment":\{"count":(\d+)\}/);
  const takenMatch = html.match(/"taken_at_timestamp":(\d+)/);
  return {
    views: Number(viewsMatch[1]),
    likes: likesMatch ? Number(likesMatch[1]) : 0,
    comments: commentsMatch ? Number(commentsMatch[1]) : 0,
    postedAt: takenMatch
      ? new Date(Number(takenMatch[1]) * 1000).toISOString()
      : null,
  };
}
