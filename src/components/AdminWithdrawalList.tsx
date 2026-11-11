"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Withdrawal } from "@/lib/types";
import { WITHDRAW_METHOD_LABELS } from "@/lib/constants";
import { formatUSD } from "@/lib/money";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

export type WithdrawalWithCreator = Withdrawal & {
  creator_email: string;
  /** On-chain transfer that paid this withdrawal (migration 0040,
   *  Round-4 P1-A3) — null on rows marked paid before 0040. */
  payout_tx_id?: string | null;
};

/** CSV-escape one cell (quotes + commas + newlines). */
function csvCell(value: string | number): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/** Trigger a client-side CSV download from rows already loaded
 *  in the browser — no new API route (Round-4 P2-A12). */
function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const csv = [header, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  approved: "bg-sky-500/15 text-sky-300",
  paid: "bg-lime/15 text-lime",
  rejected: "bg-red-500/15 text-red-300",
};

/** Owner-only list of withdrawal requests with Approve / Mark paid / Reject. */
export default function AdminWithdrawalList({
  withdrawals,
}: {
  withdrawals: WithdrawalWithCreator[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  // Mark-paid confirm panel (P1-A3): which row is being confirmed,
  // and the payout Transaction ID typed into it (optional).
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payoutTxId, setPayoutTxId] = useState("");
  const { showError, showSuccess } = useToast();

  async function act(
    id: string,
    action: "approve" | "paid" | "reject",
    payoutTxIdArg?: string
  ) {
    setBusy(id);
    setBusyAction(action);
    try {
      const res = await fetch("/api/admin/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          withdrawalId: id,
          action,
          ...(payoutTxIdArg ? { payoutTxId: payoutTxIdArg } : {}),
        }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Request failed.");
      showSuccess(body.message ?? "Done.");
      setPayingId(null);
      setPayoutTxId("");
      router.refresh();
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Request failed. Try again."
      );
    } finally {
      setBusy(null);
      setBusyAction(null);
    }
  }

  // Round-4 P1-A5: every money action confirms first (same
  // window.confirm pattern as the review list). Approve shows
  // the amount; Reject shows the refund amount; Mark paid is
  // confirmed in its own panel below (amount + wallet address +
  // payout TxID input), because a paid row can never be
  // re-rejected and a misclick there is unrecoverable in-app.
  function confirmApprove(w: WithdrawalWithCreator) {
    if (
      !window.confirm(
        `Approve this withdrawal of ${formatUSD(w.final_amount)} for ${w.creator_email}? You still have to send the USDT yourself, then mark it paid.`
      )
    ) {
      return;
    }
    void act(w.id, "approve");
  }

  function confirmReject(w: WithdrawalWithCreator) {
    if (
      !window.confirm(
        `Reject this withdrawal and refund ${formatUSD(w.amount)} to ${w.creator_email}'s withdrawable balance?`
      )
    ) {
      return;
    }
    void act(w.id, "reject");
  }

  function confirmPaid(w: WithdrawalWithCreator) {
    const txId = payoutTxId.trim();
    // P1-A3: when a TxID is given it must be a real TRON hash
    // (exactly 64 hex chars) — the API re-validates it too.
    if (txId && !/^[0-9a-fA-F]{64}$/.test(txId)) {
      showError(
        "Invalid payout Transaction ID — it must be exactly 64 hexadecimal characters (the hash of the USDT transfer)."
      );
      return;
    }
    void act(w.id, "paid", txId || undefined);
  }

  function exportCsv() {
    downloadCsv(
      `withdrawals-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "creator_email",
        "amount",
        "fee",
        "final_amount",
        "method",
        "wallet_address",
        "status",
        "payout_tx_id",
        "created_at",
      ],
      withdrawals.map((w) => [
        w.creator_email,
        w.amount,
        w.fee,
        w.final_amount,
        w.method,
        w.details,
        w.status,
        w.payout_tx_id ?? "",
        w.created_at,
      ])
    );
  }

  if (withdrawals.length === 0) {
    return (
      <div className="space-y-3">
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-200">
          ⏱ Your commitment: withdrawals are usually completed within 24
          hours, and never take more than 3 days.
        </p>
        <p className="rounded-2xl border border-fg/10 bg-card p-5 text-sm text-fg/60">
          No withdrawal requests yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-200">
        ⏱ Your commitment: withdrawals are usually completed within 24
        hours, and never take more than 3 days.
      </p>
      <div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 rounded-full border border-fg/20 px-4 py-2 text-xs font-black text-fg transition hover:border-fg/40"
        >
          ⬇ Export withdrawals (CSV)
        </button>
      </div>
      {withdrawals.map((w) => (
        <div
          key={w.id}
          className="rounded-2xl border border-fg/10 bg-card p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-fg">{w.creator_email}</p>
              <p className="mt-1 text-sm text-fg/60">
                {formatUSD(w.amount)} · {WITHDRAW_METHOD_LABELS[w.method] ?? w.method} ·{" "}
                {new Date(w.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <p className="mt-1 break-all text-xs text-fg/50">
                Wallet: {w.details}
              </p>
              <p className="mt-1 text-xs text-fg/50">
                You send {formatUSD(w.final_amount)} after the 5% fee.
              </p>
              {/* P1-A3: the on-chain proof of the payout, with a
                  Tronscan link, so a creator disputing a payout
                  can be answered from the site. */}
              {w.status === "paid" && w.payout_tx_id && (
                <p className="mt-1 break-all text-xs text-fg/50">
                  Payout TxID:{" "}
                  <a
                    href={`https://tronscan.org/#/transaction/${w.payout_tx_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono font-bold text-fg underline"
                  >
                    {w.payout_tx_id}
                  </a>
                </p>
              )}
              {w.status === "paid" && !w.payout_tx_id && (
                <p className="mt-1 text-xs text-fg/50">
                  Payout TxID: not recorded (marked paid before payout
                  TxIDs were tracked).
                </p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${STATUS_CLS[w.status] ?? STATUS_CLS.pending}`}
            >
              {w.status}
            </span>
          </div>
          {w.status === "pending" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === w.id}
                onClick={() => confirmApprove(w)}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-xs font-black text-black transition hover:bg-red-600 disabled:opacity-40"
              >
                {busy === w.id && busyAction === "approve" ? (
                  <>
                    <Spinner /> Loading...
                  </>
                ) : (
                  "Approve"
                )}
              </button>
              <button
                type="button"
                disabled={busy === w.id}
                onClick={() => confirmReject(w)}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-500/50 px-4 py-2 text-xs font-black text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
              >
                {busy === w.id && busyAction === "reject" ? (
                  <>
                    <Spinner /> Loading...
                  </>
                ) : (
                  "Reject + refund"
                )}
              </button>
            </div>
          )}
          {w.status === "approved" && (
            <div className="mt-3">
              {payingId === w.id ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
                  <p className="text-sm font-bold text-fg">
                    Mark as paid — send {formatUSD(w.final_amount)} USDT
                    to this wallet first:
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-fg/70">
                    {w.details}
                  </p>
                  <label className="mt-3 block text-xs font-bold text-fg">
                    Payout Transaction ID (optional — paste the hash
                    from your wallet app so the payment is verifiable)
                    <input
                      type="text"
                      value={payoutTxId}
                      onChange={(e) => setPayoutTxId(e.target.value)}
                      placeholder="64 hex characters…"
                      autoComplete="off"
                      spellCheck={false}
                      className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 font-mono text-sm text-fg outline-none placeholder:text-fg/30 focus:border-red-500"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === w.id}
                      onClick={() => confirmPaid(w)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-xs font-black text-black transition hover:bg-red-600 disabled:opacity-40"
                    >
                      {busy === w.id && busyAction === "paid" ? (
                        <>
                          <Spinner /> Loading...
                        </>
                      ) : (
                        "Confirm — USDT sent"
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={busy === w.id}
                      onClick={() => {
                        setPayingId(null);
                        setPayoutTxId("");
                      }}
                      className="inline-flex items-center rounded-full border border-fg/20 px-4 py-2 text-xs font-black text-fg transition hover:border-fg/40"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === w.id}
                    onClick={() => {
                      setPayingId(w.id);
                      setPayoutTxId("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-xs font-black text-black transition hover:bg-red-600 disabled:opacity-40"
                  >
                    Mark paid
                  </button>
                  <button
                    type="button"
                    disabled={busy === w.id}
                    onClick={() => confirmReject(w)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-500/50 px-4 py-2 text-xs font-black text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                  >
                    {busy === w.id && busyAction === "reject" ? (
                      <>
                        <Spinner /> Loading...
                      </>
                    ) : (
                      "Reject + refund"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
