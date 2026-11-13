"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

/**
 * Warning button for one creator (admin tabs, Creators tab).
 * A warning is a record — who, why, when — NOT a ban. Bans
 * still go through the fraud ladder / block flow. The reason is
 * required: the button stays disabled until one is typed, and
 * the creator is told via an in-app notification at warn time.
 */
export default function WarnCreatorButton({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const { showError, showSuccess } = useToast();

  const warn = async () => {
    const trimmed = reason.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/warn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, reason: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        showError(data.error ?? "Could not warn this creator.");
        return;
      }
      setDone(true);
      showSuccess(data.message ?? `Warning recorded for ${email}.`);
      router.refresh();
    } catch {
      showError("Could not warn this creator — please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <span className="text-xs font-bold text-amber-300">
        ⚠ Warning recorded
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Warning reason (required)"
        aria-label={`Warning reason for ${email}`}
        className="w-44 rounded-lg border border-fg/15 bg-bg px-2 py-1.5 text-xs text-fg placeholder:text-fg/40 focus:border-amber-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={warn}
        disabled={!reason.trim() || busy}
        className="rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Warning…" : "⚠ Warn"}
      </button>
    </span>
  );
}
