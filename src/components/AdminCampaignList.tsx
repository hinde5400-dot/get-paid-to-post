"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Campaign } from "@/lib/types";
import { campaignPlatforms } from "@/lib/types";
import { formatUSD } from "@/lib/money";
import { PLATFORM_LABELS } from "@/lib/constants";
import { BrandLogoTile } from "./CampaignBanner";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/**
 * Owner-only pending-campaign review list (Admin Review page).
 * Each row shows Brand Name, Budget, Rate, Platform and funded status,
 * with Approve / Reject buttons. Approve only after the brand's
 * budget has actually reached the owner.
 */
export default function AdminCampaignList({
  campaigns,
}: {
  campaigns: Campaign[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(
    null
  );
  const { showError, showSuccess } = useToast();

  async function act(campaign: Campaign, action: "approve" | "reject") {
    setBusyId(campaign.id);
    setBusyAction(action);
    // The Approve button was once seen stuck on "Loading..." (admin
    // screenshot 2026-11-10 12:19 PKT). The handler already cleared
    // its loading state in `finally`, so a stuck spinner could only
    // come from a fetch that never settles (stalled mobile
    // connection) — fetch() has no timeout of its own. Abort after
    // 30s so a stalled request errors out with a toast instead of
    // spinning forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, action }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");
      showSuccess(
        action === "approve"
          ? "Campaign approved — it is now live."
          : "Campaign rejected."
      );
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        showError(
          "The request timed out — check your connection and try again."
        );
      } else {
        showError(err instanceof Error ? err.message : "Action failed.");
      }
    } finally {
      clearTimeout(timer);
      setBusyId(null);
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-3">
      {campaigns.map((c) => (
        <div
          key={c.id}
          className="rounded-3xl border border-fg/10 bg-card p-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <BrandLogoTile campaign={c} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-black tracking-tight text-fg">
                {c.brand_name}
              </p>
              <p className="truncate text-sm text-fg/60">{c.title}</p>
            </div>
            {/* Payment status — at a glance: has the brand actually
                submitted payment, or is this a junk pending campaign? */}
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
                c.payment_tx_id
                  ? "bg-red-500/15 text-red-300"
                  : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {c.payment_tx_id ? "Payment submitted" : "No payment yet"}
            </span>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
                c.is_funded
                  ? "bg-red-500/15 text-red-300"
                  : "bg-fg/10 text-fg/60"
              }`}
            >
              {c.is_funded ? "Funded" : "Not funded"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-fg/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
                Budget
              </p>
              <p className="mt-1 font-display text-base font-black text-fg">
                {formatUSD(c.budget_total)}
              </p>
            </div>
            <div className="rounded-2xl bg-fg/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
                Rate / 1K views
              </p>
              <p className="mt-1 font-display text-base font-black text-fg">
                {formatUSD(c.view_bonus_per_1k)}
              </p>
            </div>
            <div className="rounded-2xl bg-fg/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
                Platform
              </p>
              <p className="mt-1 font-display text-base font-black text-fg">
                {campaignPlatforms(c)
                  .map((p) => PLATFORM_LABELS[p])
                  .join(" · ")}
              </p>
            </div>
          </div>

          {/* Fee split: 15% flat platform fee charged ON TOP of the
              budget; the creators pool is the full budget. The admin
              approves only after verifying the TOTAL arrived. */}
          <p className="mt-3 text-xs font-semibold text-fg/60">
            Platform fee (15%): {formatUSD(c.platform_fee)} · Total to
            verify: {formatUSD(c.budget_total + c.platform_fee)} ·
            Creators pool (full budget): {formatUSD(c.budget_total)}
          </p>

          {c.description && (
            <p className="mt-3 text-sm leading-relaxed text-fg/60">
              {c.description}
            </p>
          )}

          {/* Payment status — the proof the budget was sent. Green =
              the brand submitted a Transaction ID; amber = no payment
              yet, so this is junk until the budget actually arrives. */}
          <div
            className={`mt-3 rounded-xl px-4 py-3 ${
              c.payment_tx_id
                ? "border border-red-500/30 bg-red-500/10"
                : "border border-amber-400/30 bg-amber-500/10"
            }`}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
              Payment status
            </p>
            {c.payment_tx_id ? (
              <>
                <p className="mt-1 text-xs font-black text-red-300">
                  Payment submitted
                </p>
                <p
                  className="mt-1 font-mono text-xs font-bold text-fg/80"
                  title={c.payment_tx_id}
                >
                  TxID:{" "}
                  {c.payment_tx_id.length > 12
                    ? `${c.payment_tx_id.slice(0, 12)}…`
                    : c.payment_tx_id}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-xs font-black text-amber-300">
                  No payment yet
                </p>
                <p className="mt-1 text-xs font-semibold text-fg/60">
                  The brand has not submitted a payment. Do not approve
                  until the budget reaches you.
                </p>
              </>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => void act(c, "approve")}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-500 py-2.5 text-sm font-black text-white transition hover:bg-red-600 disabled:opacity-40"
            >
              {busyId === c.id && busyAction === "approve" ? (
                <>
                  <Spinner /> Loading...
                </>
              ) : (
                "Approve — go live"
              )}
            </button>
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => void act(c, "reject")}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-red-400/40 py-2.5 text-sm font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              {busyId === c.id && busyAction === "reject" ? (
                <>
                  <Spinner /> Loading...
                </>
              ) : (
                "Reject"
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
