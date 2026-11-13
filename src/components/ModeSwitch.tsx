"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MODE_COOKIE } from "@/lib/constants";
import type { UserMode } from "@/lib/mode";

/**
 * Mode switch (creator <-> brand), shown only when the user is
 * capable of BOTH modes (getModeContext().canSwitch): in More for
 * creator mode and in Brand Profile for brand mode. Writes the
 * mode cookie, then goes to the other mode's home and refreshes
 * so the server layout re-renders the right navigation.
 */
export default function ModeSwitch({
  mode,
  className = "",
}: {
  mode: UserMode;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const target: UserMode = mode === "brand" ? "creator" : "brand";
  const label =
    target === "brand" ? "Switch to Brand Mode" : "Switch to Creator Mode";

  function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      document.cookie = `${MODE_COOKIE}=${target}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Cookie write failed — the push below still navigates.
    }
    router.push(target === "brand" ? "/brand/campaigns" : "/campaigns");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`rounded-full border border-fg/20 px-5 py-2.5 text-sm font-bold text-fg transition hover:border-lime hover:text-lime disabled:opacity-40 ${className}`}
    >
      {label}
    </button>
  );
}
