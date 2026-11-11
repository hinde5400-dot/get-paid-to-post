"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatUSD } from "@/lib/money";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/**
 * "Mark refund sent" (+ "Cancel request") for one open refund
 * request in the /admin refund queue (Round-5 P1). POSTs to
 * /api/admin/refunds, which flips the request from 'requested'
 * to 'sent' — only tap it AFTER the USDT refund has actually
 * been sent to the brand, because a 'sent' request leaves the
 * queue and cannot be re-marked. "Cancel request" closes a
 * superseded request instead (e.g. an overpayment row on a
 * campaign that is now being refunded in full — the money goes
 * out once, via the rejected refund). Owner-only: this component
 * only ever renders on /admin.
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

  async function closeRequest(action: "sent" | "cancelled") {
    const isCancel = action === "cancelled";
    if (
      !window.confirm(
        isCancel
          ? `Cancel the ${formatUSD(amount)} refund request for "${campaignTitle}"? Use this only when the request is superseded (e.g. the campaign is being refunded in full instead) — a cancelled request leaves the queue and cannot be re-opened.`
          : `Mark the ${formatUSD(amount)} refund for "${campaignTitle}" as sent? Only do this after the USDT has actually been sent to the brand — a sent request leaves the queue and cannot be re-marked.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ??
            (isCancel
              ? "Could not cancel the refund request."
              : "Could not mark the refund as sent.")
        );
      }
      showSuccess(
        (data as { message?: string }).message ??
          (isCancel
            ? "Refund request cancelled."
            : "Refund marked as sent.")
      );
      router.refresh();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : isCancel
            ? "Could not cancel the refund request."
            : "Could not mark the refund as sent."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => void closeRequest("sent")}
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
      <button
        type="button"
        onClick={() => void closeRequest("cancelled")}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3 py-2 text-xs font-bold text-fg/70 transition hover:border-white/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >
        Cancel request
      </button>
    </span>
  );
}
