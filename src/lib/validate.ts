import type { Platform } from "./types";
import { extractYouTubeVideoId } from "./views/youtube";

const PLATFORM_HOSTS: Record<Platform, string[]> = {
  // vm/vt.tiktok.com are TikTok's short-link hosts — accepted so
  // the submit route can resolve them to the real video URL.
  tiktok: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  // ig.me is Instagram's short-link host — same treatment.
  instagram: ["instagram.com", "www.instagram.com", "ig.me"],
  youtube: ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"],
};

export function hostnameOf(raw: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(raw.trim())
      ? raw.trim()
      : `https://${raw.trim()}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** A profile/channel link must be a real video link, not a profile
 *  page: tiktok.com/@someone or instagram.com/someone passes a
 *  host-only check but is not a clip. Short-link hosts (vm/vt,
 *  ig.me, youtu.be) carry no readable path, so any path is allowed
 *  there — the link resolves to the real video before the check.
 *  tiktok.com/t/CODE is TikTok's own Share → Copy link format, so
 *  it counts as a video link too (it resolves to /video/ID
 *  server-side; see canonical-url.ts). */
function pathLooksLikeVideo(raw: string, platform: Platform): boolean {
  let path = "";
  try {
    const withScheme = /^https?:\/\//i.test(raw.trim())
      ? raw.trim()
      : `https://${raw.trim()}`;
    path = new URL(withScheme).pathname;
  } catch {
    return false;
  }
  if (platform === "tiktok") {
    return /\/video\/\d+/.test(path) || /^\/t\/[A-Za-z0-9]+/.test(path);
  }
  if (platform === "instagram") {
    return /^\/(reel|reels|p)\/[^/]+/.test(path);
  }
  // YouTube: any spelling with a readable video ID.
  return extractYouTubeVideoId(raw) !== null;
}

/** Accept only tiktok.com / instagram.com / youtube.com links (plus
 *  their short-link hosts: vm/vt.tiktok.com, ig.me, youtu.be). */
export function validatePostUrl(
  raw: string,
  platform: Platform
): { ok: boolean; error?: string } {
  const url = raw.trim();
  if (!url) return { ok: false, error: "A link is required." };
  const host = hostnameOf(url);
  if (!host) return { ok: false, error: "That does not look like a valid link." };
  const allowed = PLATFORM_HOSTS[platform];
  const matches = allowed.some((h) => host === h || host.endsWith(`.${h}`));
  if (!matches) {
    // Name the full accepted set: TikTok also accepts its
    // vm/vt.tiktok.com short links, YouTube also accepts youtu.be,
    // Instagram also accepts ig.me — a creator pasting a short
    // link that fails for another reason must not be told only
    // the main host is allowed.
    const accepted =
      platform === "tiktok"
        ? "TikTok"
        : platform === "instagram"
          ? "Instagram"
          : "YouTube";
    const hosts =
      platform === "tiktok"
        ? "tiktok.com, vm.tiktok.com and vt.tiktok.com"
        : platform === "instagram"
          ? "instagram.com and ig.me"
          : "youtube.com and youtu.be";
    return {
      ok: false,
      error: `Please paste a real ${accepted} link (${hosts} links are accepted).`,
    };
  }
  // Short-link hosts resolve to the real video later, so their
  // path cannot be checked here — everything else must already
  // look like a video link, not a profile page.
  const isShortHost =
    host === "vm.tiktok.com" ||
    host === "vt.tiktok.com" ||
    host === "ig.me" ||
    host === "youtu.be";
  if (!isShortHost && !pathLooksLikeVideo(url, platform)) {
    const label =
      platform === "tiktok"
        ? "TikTok video (/video/… or a /t/ share link)"
        : platform === "instagram"
          ? "Instagram Reel (/reel/…)"
          : "YouTube video";
    return {
      ok: false,
      error: `That is not a ${label} link — paste the link to the video itself, not a profile page.`,
    };
  }
  return { ok: true };
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * A plausible TRON transaction ID: exactly 64 hexadecimal
 * characters (the hash of a TRC20 USDT transfer). Anything else —
 * a random word, a short string, a URL — is not a transaction ID
 * and must be rejected, so a brand cannot "pay" with nonsense.
 */
export function isValidTronTxId(raw: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(raw.trim());
}

/**
 * Originality-proof screenshot links must be image links, not any
 * URL. Accepted: a direct image link (.png / .jpg / .jpeg / .webp /
 * .gif) or a link from a screenshot host (Imgur, Lightshot /
 * prnt.sc, ibb.co, postimages). Google Drive file links are NOT
 * images — they open a Drive viewer, not a screenshot — and bare
 * domains, the campaign page and the post link itself are not
 * proof either. The error names what counts, so a creator is never
 * left guessing why their link was refused.
 *
 * `postUrls` (the submitted clip links, when the caller knows
 * them) lets the proof be rejected explicitly when it IS the post
 * link itself, instead of only failing the image check.
 */
export function validateProofUrl(
  raw: string,
  postUrls: string[] = []
): {
  ok: boolean;
  error?: string;
} {
  const url = raw.trim();
  if (!url) return { ok: false, error: "A proof link is required." };
  let parsed: URL;
  try {
    parsed = new URL(
      /^https?:\/\//i.test(url) ? url : `https://${url}`
    );
  } catch {
    return {
      ok: false,
      error:
        "Proof must be a real link (starting with http:// or https://) to your screenshot.",
    };
  }
  if (!/^https?:$/i.test(parsed.protocol) || !parsed.hostname.includes(".")) {
    return {
      ok: false,
      error:
        "Proof must be a direct image link (.png, .jpg, .webp or .gif) or a screenshot link from Imgur, Lightshot (prnt.sc), ibb.co or postimages — not a bare domain.",
    };
  }
  // The post link itself is not proof of anything.
  const normalize = (s: string) =>
    s
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  const normalized = normalize(url);
  for (const post of postUrls) {
    if (post.trim() && normalize(post) === normalized) {
      return {
        ok: false,
        error:
          "Proof must be a screenshot link, not the post link itself — link to a screenshot of your live post or your editing project.",
      };
    }
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  // Direct image link — any host.
  if (/\.(png|jpe?g|webp|gif)(\?|#|$)/.test(path)) return { ok: true };
  // Known screenshot hosts — any path (their short/page links are
  // still screenshot links).
  const screenshotHosts = [
    "imgur.com",
    "i.imgur.com",
    "prnt.sc",
    "prntscr.com",
    "lightshot.com",
    "ibb.co",
    "i.ibb.co",
    "postimages.org",
    "postimg.cc",
    "i.postimg.cc",
  ];
  if (screenshotHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { ok: true };
  }
  if (host === "drive.google.com" || host.endsWith(".drive.google.com") || host === "docs.google.com" || host.endsWith(".docs.google.com")) {
    return {
      ok: false,
      error:
        "Google Drive links are not images — upload your screenshot to Imgur, Lightshot (prnt.sc), ibb.co or postimages and paste the image link instead.",
    };
  }
  return {
    ok: false,
    error:
      "Proof must be a direct image link (.png, .jpg, .webp or .gif) or a screenshot link from Imgur, Lightshot (prnt.sc), ibb.co or postimages.",
  };
}

/** Video rules every submission must follow. */
export const VIDEO_RULES = [
  "Vertical video only — 9:16 format.",
  "Add captions to your clip.",
  "Hook viewers in the first 3 seconds.",
  "Follow the campaign brief exactly.",
  "Use only your own original content.",
  "No fake views, likes or engagement.",
] as const;
