"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

/**
 * Brand-owned campaign actions (My Campaigns tab). Same button
 * styles and confirm-then-fetch pattern as the admin pause button
 * (AdminCampaignCards) — only the endpoint and the ownership
 * check differ: these hit the brand-scoped routes, which only
 * accept the campaign's own brand.
 */
export function BrandPauseButton({
  campaignId,
  title,
  isPaused,
}: {
  campaignId: string;
  title: string;
  isPaused: boolean;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [busy, setBusy] = useState(false);
  const next = !isPaused;

  async function onClick() {
    if (busy) return;
    if (
      !window.confirm(
        next
          ? `Pause "${title}"? It hides from Discover and creators can no longer submit to it. Existing clips are untouched.`
          : `Start "${title}" again? It goes back live on Discover and creators can submit to it.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/brand/campaigns/${campaignId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        showError(data.error ?? "Could not change the campaign state.");
        return;
      }
      showSuccess(
        data.message ?? (next ? "Campaign paused." : "Campaign started.")
      );
      router.refresh();
    } catch {
      showError("Could not change the campaign state.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className="rounded-full border border-fg/20 px-4 py-2 text-xs font-bold text-fg transition hover:border-lime hover:text-limeink disabled:opacity-40"
    >
      {isPaused ? "Resume Campaign" : "Pause Campaign"}
    </button>
  );
}

export function BrandDeleteButton({
  campaignId,
  title,
}: {
  campaignId: string;
  title: string;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    if (
      !window.confirm(
        `Delete "${title}"? This permanently cancels the pending campaign. You can create a new one any time.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/brand/campaigns/${campaignId}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        showError(data.error ?? "Could not delete the campaign.");
        return;
      }
      showSuccess(data.message ?? "Campaign deleted.");
      router.refresh();
    } catch {
      showError("Could not delete the campaign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className="rounded-full border border-red-500/40 px-4 py-2 text-xs font-bold text-red-300 transition hover:border-red-400 hover:text-red-200 disabled:opacity-40"
    >
      Delete / Cancel
    </button>
  );
}
