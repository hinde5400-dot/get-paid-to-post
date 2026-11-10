// Canonical post URLs — duplicate-link hardening.
//
// The submit-time duplicate check compares post_url exactly, so the
// same video pasted as a short link (vm.tiktok.com, youtu.be) or as
// a /shorts/ link slipped past it as a "different" video. Every
// submitted link is canonicalized BEFORE the duplicate check and
// the canonical form is what gets stored, so all spellings of one
// video collapse to one URL.
//
// Robustness (non-negotiable): resolving a short link is best
// effort. Any failure — network error, timeout, non-2xx, redirect
// loop — logs a warning and returns the submitted URL unchanged.
// A submit is NEVER blocked or failed because a short-link host
// did not answer.

import type { Platform } from "./types";
import { extractYouTubeVideoId } from "./views/youtube";

/** How long a short-link host gets to answer before we give up and
 *  keep the submitted URL. A slow redirect host must never hang a
 *  submit. */
export const SHORT_LINK_TIMEOUT_MS = 5000;

/** Hosts whose links are just redirects to the real post URL. */
const REDIRECT_HOSTS = new Set([
  "vm.tiktok.com",
  "vt.tiktok.com",
  "ig.me",
]);

function hostOf(raw: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(raw.trim())
      ? raw.trim()
      : `https://${raw.trim()}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Follow a short link to its final URL (fetch follows redirects).
 * On any failure — network error, timeout, non-2xx, redirect loop
 * — logs a warning and returns the submitted URL unchanged.
 */
export async function resolveRedirectUrl(rawUrl: string): Promise<string> {
  const target = /^https?:\/\//i.test(rawUrl.trim())
    ? rawUrl.trim()
    : `https://${rawUrl.trim()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHORT_LINK_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      redirect: "follow",
      signal: controller.signal,
      // A plain fetch UA is sometimes refused a redirect by the
      // short-link host; a browser UA makes resolution succeed.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GetPaidToPost/1.0)" },
    });
    if (!res.ok) {
      console.warn(
        `Short-link resolve: ${target} answered HTTP ${res.status}, keeping submitted URL.`
      );
      return rawUrl;
    }
    return res.url || rawUrl;
  } catch (err) {
    console.warn(
      `Short-link resolve failed for ${target}, keeping submitted URL:`,
      err instanceof Error ? err.message : err
    );
    return rawUrl;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Canonical form of a submitted post link.
 * - YouTube: any spelling with a readable video ID (youtu.be,
 *   /shorts/, /live/, /embed/, m.youtube.com, watch with tracking
 *   params) becomes https://www.youtube.com/watch?v=VIDEOID.
 *   No readable ID → returned unchanged.
 * - TikTok / Instagram short links (vm.tiktok.com, vt.tiktok.com,
 *   ig.me) and TikTok share links (tiktok.com/t/CODE — what
 *   TikTok's own Share → Copy link produces) are resolved to the
 *   final URL, so extractTikTokVideoId can read an ID off them.
 * - Dedupe canonical form drops the author segment: TikTok →
 *   tiktok.com/video/<id>; Instagram → instagram.com/reel/<id>
 *   or /p/<id> without the author. A username change must not
 *   make the same video a "different" URL for the duplicate check.
 * - Anything else (plain tiktok.com / instagram.com links):
 *   tracking params, fragments and trailing slashes are stripped,
 *   and a leading www. is dropped.
 */
export async function canonicalizePostUrl(
  rawUrl: string,
  platform: Platform
): Promise<string> {
  const url = rawUrl.trim();
  if (platform === "youtube") {
    const videoId = extractYouTubeVideoId(url);
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
  }
  const host = hostOf(url);
  const isTikTokShareLink =
    platform === "tiktok" &&
    (host === "tiktok.com" || host === "www.tiktok.com") &&
    /^\/t\/[^/]+/.test(pathOf(url));
  let working = url;
  if (
    host &&
    (REDIRECT_HOSTS.has(host) ||
      host.endsWith(".vm.tiktok.com") ||
      host.endsWith(".vt.tiktok.com") ||
      isTikTokShareLink)
  ) {
    const resolved = await resolveRedirectUrl(url);
    // A dead/unknown short code redirects to the platform's
    // homepage (e.g. tiktok.com/?_r=1). That is NOT the video —
    // and every dead code would collapse to the same homepage
    // URL and false-positive as duplicates of each other. Keep
    // the submitted short link instead.
    try {
      const finalUrl = new URL(resolved);
      if (finalUrl.pathname === "/" || finalUrl.pathname === "") {
        console.warn(
          `Short-link resolve: ${url} landed on ${finalUrl.hostname} homepage, keeping submitted URL.`
        );
        return url;
      }
    } catch {
      return url;
    }
    working = stripTracking(resolved);
  } else {
    working = stripTracking(url);
  }
  // Drop the author segment so the same video under a changed
  // username still dedupes to one URL.
  if (platform === "tiktok") {
    const videoId = working.match(/\/video\/(\d+)/);
    if (videoId) return `https://tiktok.com/video/${videoId[1]}`;
  }
  if (platform === "instagram") {
    const reel = working.match(/\/(reel|reels|p)\/([^/?#]+)/);
    if (reel) {
      const kind = reel[1] === "reels" ? "reel" : reel[1];
      return `https://instagram.com/${kind}/${reel[2]}`;
    }
  }
  return working;
}

/** Pathname of a URL, "" when it cannot be parsed. */
function pathOf(raw: string): string {
  try {
    const withScheme = /^https?:\/\//i.test(raw.trim())
      ? raw.trim()
      : `https://${raw.trim()}`;
    return new URL(withScheme).pathname;
  } catch {
    return "";
  }
}

/**
 * Strip tracking query params, fragments and trailing slashes,
 * and drop a leading www. — the same video pasted with
 * ?is_from_webapp=1, ?igshid=…, or a trailing slash is the same
 * video for the duplicate check. Never throws: on any parse
 * failure the URL is returned unchanged.
 */
function stripTracking(rawUrl: string): string {
  try {
    const u = new URL(
      /^https?:\/\//i.test(rawUrl.trim())
        ? rawUrl.trim()
        : `https://${rawUrl.trim()}`
    );
    u.search = "";
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "");
    u.pathname = path === "" ? "/" : path;
    if (u.hostname.startsWith("www.")) {
      u.hostname = u.hostname.slice(4);
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}
