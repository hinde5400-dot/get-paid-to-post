import type { Platform } from "@/lib/types";
import { siInstagram, siTiktok, siYoutube } from "simple-icons";

/**
 * Official platform marks (simple-icons, CC0) — the real brand
 * glyphs, not generic shapes. Rendered with currentColor so the
 * caller sets the brand colour (TikTok adapts to the theme,
 * Instagram pink, YouTube red).
 */

export function TikTokIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="TikTok">
      <path d={siTiktok.path} />
    </svg>
  );
}

export function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Instagram">
      <path d={siInstagram.path} />
    </svg>
  );
}

export function YouTubeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="YouTube">
      <path d={siYoutube.path} />
    </svg>
  );
}

const PLATFORM_ICONS: Record<Platform, (props: { className?: string }) => JSX.Element> = {
  tiktok: TikTokIcon,
  instagram: InstagramIcon,
  youtube: YouTubeIcon,
};

const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

/** Small round platform chips, e.g. TikTok + Instagram + YouTube. */
export function PlatformChips({
  platform,
  platforms,
  size = "md",
}: {
  platform: Platform | "all";
  /** Chosen platforms (migration 0012) — when given, these are shown. */
  platforms?: Platform[];
  size?: "sm" | "md";
}) {
  const list: Platform[] =
    platforms && platforms.length > 0
      ? platforms
      : platform === "all"
        ? ["tiktok", "instagram", "youtube"]
        : [platform];
  return (
    <span className="flex items-center gap-1.5">
      {list.map((p) => {
        const Icon = PLATFORM_ICONS[p];
        return (
          <span
            key={p}
            title={PLATFORM_LABELS[p]}
            className={`flex items-center justify-center rounded-full bg-fg/10 text-fg ${
              size === "sm" ? "h-6 w-6" : "h-7 w-7"
            }`}
          >
            <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </span>
        );
      })}
    </span>
  );
}
