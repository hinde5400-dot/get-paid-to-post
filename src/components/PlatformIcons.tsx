import type { Platform } from "@/lib/types";

/** Inline SVG platform marks — no new dependencies, no image files. */

export function TikTokIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="TikTok">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

export function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-label="Instagram">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function YouTubeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="YouTube">
      <path d="M23 7.2s-.22-1.56-.9-2.25c-.86-.9-1.82-.9-2.26-.96C16.7 3.75 12 3.75 12 3.75s-4.7 0-7.84.24c-.44.05-1.4.06-2.26.96-.68.69-.9 2.25-.9 2.25S.75 9.03.75 10.87v1.7c0 1.83.25 3.67.25 3.67s.22 1.56.9 2.25c.86.9 1.99.87 2.49.97 1.8.18 7.61.24 7.61.24s4.71-.06 7.84-.3c.44-.05 1.4-.06 2.26-.96.68-.69.9-2.25.9-2.25s.25-1.83.25-3.67v-1.7c0-1.83-.25-3.67-.25-3.67zM9.75 14.85V8.65l6.07 3.1-6.07 3.1z" />
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
  size = "md",
}: {
  platform: Platform | "all";
  size?: "sm" | "md";
}) {
  const platforms: Platform[] =
    platform === "all" ? ["tiktok", "instagram", "youtube"] : [platform];
  return (
    <span className="flex items-center gap-1.5">
      {platforms.map((p) => {
        const Icon = PLATFORM_ICONS[p];
        return (
          <span
            key={p}
            title={PLATFORM_LABELS[p]}
            className={`flex items-center justify-center rounded-full bg-white/10 text-white ${
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
