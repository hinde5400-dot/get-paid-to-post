"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Platform } from "@/lib/types";
import { formatUSD } from "@/lib/money";
import { PLATFORM_LABELS } from "@/lib/constants";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

export type PayoutTone = "amber" | "sky" | "green" | "red";

export interface PayoutRow {
  key: string;
  kind: "earning" | "withdrawal";
  /** Present on earning rows — the submission the flag acts on. */
  submissionId?: string;
  creator_email: string;
  campaign_title: string;
  post_url?: string;
  platform?: Platform;
  views: number;
  amount: number;
  status: string;
  tone: PayoutTone;
  hold_until?: string | null;
  created_at: string;
  flagged?: boolean;
  flagReason?: string;
  network?: string;
  address?: string;
}

const TONE_CLS: Record<PayoutTone, string> = {
  amber: "bg-amber-500/15 text-amber-300",
  sky: "bg-sky-500/15 text-sky-300",
  green: "bg-green-500/15 text-green-300",
  red: "bg-red-500/15 text-red-300",
};

/**
 * PAYOUTS (admin batch 2, Content Rewards-style): every approved
 * earning as Pending (72h hold, with hold-until date), Withdrawable,
 * Withdrawal requested, Paid, or Rejected/Returned — with per-row
 * details and a Flag payout action on earning rows. Display + flag
 * ONLY over existing data (wallets / withdrawals / submissions):
 * the money flow does not change — Turn still pays USDT manually
 * and marks Paid in the Withdrawal requests section above.
 */
export default function AdminPayoutsList({ rows }: { rows: PayoutRow[] }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [flagBusy, setFlagBusy] = useState<string | null>(null);

  async function flagPayout(row: PayoutRow, action: "flag" | "unflag") {
    if (!row.submissionId) return;
    if (action === "flag" && !flagReason.trim()) {
      showError("Give a reason for the flag.");
      return;
    }
    setFlagBusy(row.submissionId);
    try {
      const res = await fetch("/api/admin/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: row.submissionId,
          action,
          reason: flagReason.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        showError(data.error ?? "Could not flag this payout.");
        return;
      }
      showSuccess(data.message ?? "Done.");
      setFlaggingId(null);
      setFlagReason("");
      router.refresh();
    } catch {
      showError("Could not flag this payout.");
    } finally {
      setFlagBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-fg/10 bg-card p-8 text-center">
        <p className="font-bold text-fg">No payouts yet</p>
        <p className="mt-1 text-sm text-fg/60">
          Approved earnings and withdrawal requests will appear here.
        </p>
      </div>
    );
  }

  const count = (status: string) =>
    rows.filter((r) => r.status === status).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg/60">
        {count("Pending (72h hold)")} in 72h hold ·{" "}
        {count("Withdrawable")} withdrawable ·{" "}
        {count("Withdrawal requested")} withdrawal requested ·{" "}
        {count("Paid")} paid · {count("Rejected / Returned")} returned
      </p>
      {rows.map((r) => (
        <article
          key={r.key}
          className="rounded-2xl border border-fg/10 bg-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-red-300">
                {r.kind === "earning" && r.platform
                  ? `${PLATFORM_LABELS[r.platform]} · `
                  : ""}
                {r.creator_email}
              </p>
              <h3 className="mt-1 font-bold text-fg">{r.campaign_title}</h3>
              {r.post_url && (
                <a
                  href={r.post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block max-w-md truncate text-sm text-fg/60 underline"
                >
                  {r.post_url}
                </a>
              )}
              {r.kind === "withdrawal" && r.address && (
                <p className="mt-1 break-all font-mono text-xs font-bold text-fg/60">
                  {r.network ?? "USDT"} → {r.address}
                </p>
              )}
              <p className="mt-1 text-xs text-fg/50">
                {new Date(r.created_at).toLocaleString("en-US")}
                {r.hold_until && r.status === "Pending (72h hold)"
                  ? ` · hold until ${new Date(r.hold_until).toLocaleString("en-US")}`
                  : ""}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${TONE_CLS[r.tone]}`}
            >
              {r.status}
            </span>
          </div>

          <p className="mt-3 text-sm text-fg/70">
            {r.kind === "earning" ? (
              <>
                Views:{" "}
                <span className="font-bold text-fg">
                  {r.views.toLocaleString()}
                </span>
                {" · "}Amount:{" "}
                <span className="font-bold text-fg">
                  {formatUSD(r.amount)}
                </span>
              </>
            ) : (
              <>
                Amount:{" "}
                <span className="font-bold text-fg">
                  {formatUSD(r.amount)}
                </span>
              </>
            )}
          </p>

          {/* Flag payout (admin batch 2): same Flag action as the
              review card — pauses the payout, is not a rejection. */}
          {r.kind === "earning" && r.submissionId && (
            <div className="mt-3">
              {r.flagged ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
                  <p className="font-bold">⚑ Flagged — payout paused</p>
                  <p className="mt-0.5">{r.flagReason}</p>
                  <button
                    type="button"
                    onClick={() => void flagPayout(r, "unflag")}
                    disabled={flagBusy === r.submissionId}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 px-4 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-500/10 disabled:opacity-40"
                  >
                    {flagBusy === r.submissionId ? (
                      <>
                        <Spinner /> Working...
                      </>
                    ) : (
                      "Unflag"
                    )}
                  </button>
                </div>
              ) : flaggingId === r.submissionId ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    maxLength={200}
                    autoFocus
                    value={flagReason}
                    onChange={(e) => setFlagReason(e.target.value)}
                    placeholder="Flag reason — e.g. views look bought, checking"
                    className="min-w-0 flex-1 rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-sm text-fg outline-none placeholder:text-fg/30 focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => void flagPayout(r, "flag")}
                    disabled={flagBusy === r.submissionId}
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-40"
                  >
                    {flagBusy === r.submissionId ? (
                      <>
                        <Spinner /> Working...
                      </>
                    ) : (
                      "Confirm flag"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFlaggingId(null);
                      setFlagReason("");
                    }}
                    className="inline-flex items-center rounded-full border border-fg/20 px-4 py-2 text-sm font-bold text-fg transition hover:border-fg/40"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setFlaggingId(r.submissionId!);
                    setFlagReason("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 px-4 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-500/10"
                >
                  ⚑ Flag payout
                </button>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
