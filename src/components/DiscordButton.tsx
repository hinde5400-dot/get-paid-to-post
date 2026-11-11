import { DISCORD_BADGE, DISCORD_URL } from "@/lib/constants";

/** The real Discord mark (inline SVG, drawn from the brand glyph). */
export function DiscordLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885 1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.13 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.246.198.373.292a.077.077 0 0 1-.007.13 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.029zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

/**
 * The one Discord button used everywhere support lives: the header
 * (compact), the side menu, and the Support page. Premium look —
 * Discord purple #5865F2 with the Discord logo — not plain text.
 * The invite link is the real server invite (DISCORD_URL); there
 * is no "Coming Soon" badge — the server is live.
 */
export default function DiscordButton({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noreferrer"
        title={`Join Our Discord Community — ${DISCORD_BADGE}`}
        className={`flex items-center gap-2 rounded-full bg-[#5865F2] px-3 py-2 text-xs font-black text-white shadow-lg transition hover:bg-[#4752C4] ${className}`}
      >
        <DiscordLogo className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Discord</span>
      </a>
    );
  }
  return (
    <div className={className}>
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noreferrer"
        className="flex w-full items-center justify-center gap-3 rounded-full bg-[#5865F2] px-6 py-3.5 text-sm font-black text-white shadow-lg transition hover:bg-[#4752C4]"
      >
        <DiscordLogo className="h-5 w-5 shrink-0" />
        Join Our Discord Community
      </a>
      <p className="mt-2 text-center text-xs font-bold text-fg/50">
        {DISCORD_BADGE}
      </p>
    </div>
  );
}
