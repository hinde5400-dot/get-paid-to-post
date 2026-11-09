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
 *   ig.me): resolved to the final URL. A TikTok final URL is kept
 *   exactly as resolved (tiktok.com/@user/video/ID) — the video ID
 *   is NOT parsed out of it.
 * - Anything else (plain tiktok.com / instagram.com links):
 *   returned unchanged.
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
  if (host && (REDIRECT_HOSTS.has(host) || host.endsWith(".vm.tiktok.com") || host.endsWith(".vt.tiktok.com"))) {
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
    return resolved;
  }
  return url;
}
