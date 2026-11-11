"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";
import { isValidTronTxId } from "@/lib/validate";

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
  // Round-3 P2-10: the API tells us when the TxID was a
  // correction of an earlier one — the success copy says so.
  const [wasCorrection, setWasCorrection] = useState(false);

  async function submit() {
    const hash = txId.trim();
    // A TRON transaction ID is exactly 64 hex characters — the old
    // 8–128-char check accepted any string as a "payment".
    if (!isValidTronTxId(hash)) {
      showError(
        "Enter a valid TRON Transaction ID — 64 hexadecimal characters (the hash of your USDT transfer)."
      );
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
      // Round-4 P2-B2: the identical TxID is already on file —
      // nothing changed, no re-stamp, no second alert.
      if ((data as { unchanged?: boolean }).unchanged) {
        showSuccess(
          "This Transaction ID is already on file — nothing changed."
        );
        return;
      }
      const corrected = Boolean(
        (data as { corrected?: boolean }).corrected
      );
      setWasCorrection(corrected);
      showSuccess(
        corrected
          ? "Transaction ID updated. The admin will verify the new one and your campaign will go live once payment is verified."
          : "Payment submitted. The admin will verify it and your campaign will go live once payment is verified."
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
        <p className="mt-2 text-lg font-black text-fg">
          {wasCorrection ? "Transaction ID updated" : "Payment submitted"}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-fg/70">
          After the admin verifies your payment, your campaign will go
          live. Attach your payment screenshot in the chat below so the
          admin can verify it faster.
        </p>
        <p className="mx-auto mt-3 max-w-md break-all rounded-xl bg-fg/5 px-4 py-3 font-mono text-xs text-fg">
          {txId.trim()}
        </p>
        <a
          href={`https://tronscan.org/#/transaction/${txId.trim()}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm font-bold text-lime hover:underline"
        >
          Verify on Tronscan ↗
        </a>
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
          <a
            href={`https://tronscan.org/#/transaction/${existingTxId}`}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-lime hover:underline"
          >
            Verify on Tronscan ↗
          </a>
          <br />
          You can correct it below until the admin approves it — paste
          the right Transaction ID and submit again.
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
        ) : existingTxId ? (
          "Update Transaction ID"
        ) : (
          "I Have Sent Payment"
        )}
      </button>
    </div>
  );
}
