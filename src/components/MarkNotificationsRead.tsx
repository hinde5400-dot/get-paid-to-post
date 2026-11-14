"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** "Mark all as read" — posts to the existing API route
 *  (POST /api/notifications/read, migration 0049) and refreshes
 *  the list so unread highlights clear. */
export default function MarkNotificationsRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onClick() {
    if (busy || done) return;
    setBusy(true);
    try {
      await fetch("/api/notifications/read", { method: "POST" });
      setDone(true);
      router.refresh();
    } catch {
      // Leave the button usable — the user can tap again.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || done}
      className="rounded-full border border-fg/20 px-4 py-2 text-xs font-bold text-fg transition hover:border-lime hover:text-limeink disabled:opacity-40"
    >
      {done ? "All read ✓" : busy ? "Marking…" : "Mark all as read"}
    </button>
  );
}
