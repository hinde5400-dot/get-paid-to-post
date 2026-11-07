"use client";

import { useState } from "react";
import type { Withdrawal } from "@/lib/types";
import { WITHDRAW_METHOD_LABELS } from "@/lib/constants";
import { formatUSD } from "@/lib/money";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

export type WithdrawalWithCreator = Withdrawal & { creator_email: string };

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
  const [busy, setBusy] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const { showError, showSuccess } = useToast();

  async function act(
    id: string,
    action: "approve" | "paid" | "reject"
  ) {
    setBusy(id);
    setBusyAction(action);
    try {
      const res = await fetch("/api/admin/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawalId: id, action }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Request failed.");
      showSuccess(body.message ?? "Done.");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Request failed. Try again."
      );
    } finally {
      setBusy(null);
      setBusyAction(null);
    }
  }

  if (withdrawals.length === 0) {
    return (
      <p className="rounded-2xl border border-fg/10 bg-card p-5 text-sm text-fg/60">
        No withdrawal requests yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
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
                You send {formatUSD(w.final_amount)} after the 7% fee.
              </p>
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
                onClick={() => void act(w.id, "approve")}
                className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-xs font-black text-black transition hover:bg-limedark disabled:opacity-40"
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
                onClick={() => void act(w.id, "reject")}
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
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === w.id}
                onClick={() => void act(w.id, "paid")}
                className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-xs font-black text-black transition hover:bg-limedark disabled:opacity-40"
              >
                {busy === w.id && busyAction === "paid" ? (
                  <>
                    <Spinner /> Loading...
                  </>
                ) : (
                  "Mark paid"
                )}
              </button>
              <button
                type="button"
                disabled={busy === w.id}
                onClick={() => void act(w.id, "reject")}
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
      ))}
    </div>
  );
}
