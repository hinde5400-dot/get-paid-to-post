"use client";

import { useState } from "react";
import DiscordButton from "@/components/DiscordButton";

/**
 * Floating YELLOW help bubble (admin batch 2, Turn's decision
 * 2026-11-10): a round yellow button, bottom-right on every page.
 * Tap it for a short notice — the platform is new, a few rough
 * edges are possible, and the support team is on Discord. There is
 * NO live chat on the site; Discord-only support stands.
 */
export default function HelpBubble() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed bottom-36 right-4 z-50 w-[calc(100vw-2rem)] max-w-xs rounded-2xl border border-fg/10 bg-card p-5 shadow-2xl md:bottom-20">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-extrabold text-fg">Need help?</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close help"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fg/10 text-sm font-black text-fg transition hover:bg-fg/20"
            >
              ×
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-fg/70">
            Get Paid To Post is a new platform — you may notice a few
            rough edges while we keep improving it. Our support team
            is here to help: join our Discord server and we&apos;ll
            sort it out.
          </p>
          <div className="mt-4">
            <DiscordButton />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close help" : "Help — new platform, support on Discord"}
        aria-expanded={open}
        className="fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400 text-xl font-black text-black shadow-lg transition hover:bg-yellow-300 md:bottom-6"
      >
        {open ? "×" : "?"}
      </button>
    </>
  );
}
