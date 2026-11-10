"use client";

import { useState } from "react";

/**
 * Copy text to the clipboard. navigator.clipboard.writeText can
 * fail on some mobile browsers (no permission / non-secure
 * context), so it falls back to a hidden textarea +
 * document.execCommand("copy"). Returns false only when both
 * fail — the caller then tells the user to long-press instead.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the textarea fallback.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

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
  const [copyFailed, setCopyFailed] = useState(false);
  async function copy() {
    setCopyFailed(false);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopyFailed(true);
    }
  }
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 rounded-full bg-lime px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-limedark"
      >
        {copied ? "Copied ✓" : copyFailed ? "Copy failed" : label}
      </button>
      {copyFailed && (
        <span className="max-w-[220px] text-right text-[11px] font-semibold leading-tight text-fg/60">
          Copy failed — long-press the address to copy it
        </span>
      )}
    </span>
  );
}

/**
 * Tappable text that copies itself (used for the admin wallet
 * address on the brand payment page): tapping the address copies
 * it, with a brief "Copied ✓" confirmation. Falls back the same
 * way as CopyButton when the clipboard API fails.
 */
export function CopyableText({
  text,
  children,
  className,
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function onTap() {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void onTap()}
      title="Tap to copy"
      className={className}
    >
      {children}
      {copied && (
        <span className="ml-2 whitespace-nowrap rounded-full bg-lime px-2 py-0.5 text-[11px] font-black uppercase text-black">
          Copied ✓
        </span>
      )}
    </button>
  );
}
