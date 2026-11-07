"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/**
 * Brand payment form: paste the Transaction ID / hash of the USDT
 * budget payment, then "I Have Sent Payment". Saves the hash to the
 * campaign; the admin sees it in the pending-campaigns list and
 * verifies it before approving the campaign live.
 */
export default function PaymentForm({
  campaignId,
  existingTxId,
}: {
  campaignId: string;
  existingTxId: string | null;
}) {
  const { showError, showSuccess } = useToast();
  const [txId, setTxId] = useState(existingTxId ?? "");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    const hash = txId.trim();
    if (hash.length < 8 || hash.length > 128 || /\s/.test(hash)) {
      showError("Enter a valid Transaction ID / hash.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId: hash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the payment.");
      showSuccess(
        "Payment submitted. The admin will verify it and your campaign will go LIVE in 1-2 hours."
      );
      setSubmitted(true);
      // The chat opens below — scroll to it so the brand can attach
      // the payment screenshot as proof right away.
      document
        .getElementById("brand-chat")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not save the payment.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-lime/40 bg-lime/10 p-5 text-center">
        <p className="text-3xl">🎉</p>
        <p className="mt-2 text-lg font-black text-fg">Payment submitted</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-fg/70">
          After admin verifies payment, your campaign will go LIVE in 1-2
          hours. Attach your payment screenshot in the chat below so the
          admin can verify it faster.
        </p>
        <p className="mx-auto mt-3 max-w-md break-all rounded-xl bg-fg/5 px-4 py-3 font-mono text-xs text-fg">
          {txId.trim()}
        </p>
      </div>
    );
  }

  return (
    <div>
      {existingTxId && (
        <p className="mb-3 rounded-xl bg-fg/5 px-4 py-3 text-xs leading-relaxed text-fg/60">
          Submitted Transaction ID:{" "}
          <span className="break-all font-mono font-bold text-fg">
            {existingTxId}
          </span>{" "}
          — you can correct it below if it was wrong.
        </p>
      )}
      <label className="block text-sm font-bold text-fg">
        Transaction ID / Hash
        <input
          type="text"
          value={txId}
          onChange={(e) => setTxId(e.target.value)}
          placeholder="Paste your USDT Transaction ID / hash"
          autoComplete="off"
          spellCheck={false}
          className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 font-mono text-sm text-fg outline-none placeholder:text-fg/30 focus:border-lime"
        />
      </label>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <Spinner /> Loading...
          </>
        ) : (
          "I Have Sent Payment"
        )}
      </button>
    </div>
  );
}
