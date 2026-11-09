import type { Platform } from "./types";

const PLATFORM_HOSTS: Record<Platform, string[]> = {
  // vm/vt.tiktok.com are TikTok's short-link hosts — accepted so
  // the submit route can resolve them to the real video URL.
  tiktok: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  // ig.me is Instagram's short-link host — same treatment.
  instagram: ["instagram.com", "www.instagram.com", "ig.me"],
  youtube: ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"],
};

function hostnameOf(raw: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(raw.trim())
      ? raw.trim()
      : `https://${raw.trim()}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
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
    const label =
      platform === "tiktok"
        ? "TikTok"
        : platform === "instagram"
          ? "Instagram"
          : "YouTube";
    return {
      ok: false,
      error: `Please paste a real ${label} link (only ${allowed[0]} links are accepted).`,
    };
  }
  return { ok: true };
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
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
