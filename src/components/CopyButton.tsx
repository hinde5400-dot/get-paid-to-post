"use client";

import { useState } from "react";

/** Small copy-to-clipboard button (used for the refer-a-friend link,
 *  wallet addresses and Transaction IDs). */
export default function CopyButton({
  text,
  label = "Copy link",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-full bg-lime px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-limedark"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
