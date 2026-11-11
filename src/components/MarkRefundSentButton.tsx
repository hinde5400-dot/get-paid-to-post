"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatUSD } from "@/lib/money";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/**
 * "Mark refund sent" for one open refund request in the /admin
 * refund queue (Round-5 P1). POSTs to /api/admin/refunds, which
 * flips the request from 'requested' to 'sent' — only tap it
 * AFTER the USDT refund has actually been sent to the brand,
 * because a 'sent' request leaves the queue and cannot be
 * re-marked. Owner-only: this component only ever renders on
 * /admin.
 */
export default function MarkRefundSentButton({
  refundId,
  campaignTitle,
  amount,
}: {
  refundId: string;
  campaignTitle: string;
  amount: number;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [busy, setBusy] = useState(false);

  async function markSent() {
    if (
      !window.confirm(
        `Mark the ${formatUSD(amount)} refund for "${campaignTitle}" as sent? Only do this after the USDT has actually been sent to the brand — a sent request leaves the queue and cannot be re-marked.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ??
            "Could not mark the refund as sent."
        );
      }
      showSuccess(
        (data as { message?: string }).message ?? "Refund marked as sent."
      );
      router.refresh();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Could not mark the refund as sent."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void markSent()}
      disabled={busy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-xs font-black text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? (
        <>
          <Spinner /> Marking...
        </>
      ) : (
        "Mark refund sent"
      )}
    </button>
  );
}
