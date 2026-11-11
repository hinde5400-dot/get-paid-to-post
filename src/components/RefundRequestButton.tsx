"use client";

import { useState } from "react";
import { formatUSD } from "@/lib/money";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/**
 * "Request refund" for a campaign rejected after the brand paid
 * (Round-4 P2-B5), or for the overpaid difference when the budget
 * was lowered after payment (Round-5 P2, kind='overpayment').
 * POSTs to /api/campaigns/[id]/refund, which records one open
 * request per campaign in `refund_requests`. Refunds the BUDGET
 * only — the 15% platform fee is not refundable — and the admin
 * sends it manually in USDT.
 */
export default function RefundRequestButton({
  campaignId,
  amount,
  alreadyRequested = false,
  /** 'rejected' (default): whole budget back on a rejected
   *  campaign. 'overpayment': the overpaid difference on a
   *  pending/live campaign whose budget was lowered after
   *  payment. */
  kind = "rejected",
}: {
  campaignId: string;
  /** Refundable budget (the 15% fee is excluded). */
  amount: number;
  alreadyRequested?: boolean;
  kind?: "rejected" | "overpayment";
}) {
  const { showError, showSuccess } = useToast();
  const [requested, setRequested] = useState(alreadyRequested);
  const [busy, setBusy] = useState(false);

  async function request() {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not request the refund.");
      showSuccess(
        (data as { message?: string }).message ??
          "Refund requested — the admin will send your budget back in USDT."
      );
      setRequested(true);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not request the refund.");
    } finally {
      setBusy(false);
    }
  }

  if (requested) {
    return (
      <div className="rounded-2xl border border-lime/40 bg-lime/10 px-4 py-3 text-sm leading-relaxed text-lime">
        <span className="font-black">
          {kind === "overpayment"
            ? "Overpayment refund requested."
            : "Refund requested."}
        </span>{" "}
        The admin will send your {formatUSD(amount)}{" "}
        {kind === "overpayment" ? "overpaid budget" : "budget"} back in
        USDT. The 15% platform fee is not refundable.
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void request()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3 text-sm font-black text-black transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <Spinner /> Requesting...
          </>
        ) : kind === "overpayment" ? (
          `Request refund of ${formatUSD(amount)} overpayment`
        ) : (
          `Request refund of ${formatUSD(amount)}`
        )}
      </button>
      <p className="mt-2 text-center text-xs leading-relaxed text-fg/50">
        Refunds the {kind === "overpayment" ? "overpaid " : ""}budget
        only — the 15% platform fee is not refundable. The admin
        sends it manually in USDT, usually within 5–7 business days.
      </p>
    </div>
  );
}
