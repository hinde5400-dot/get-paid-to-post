"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Campaign } from "@/lib/types";
import { formatUSD } from "@/lib/money";
import { PLATFORM_LABELS } from "@/lib/constants";
import { BrandLogoTile } from "./CampaignBanner";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/**
 * Owner-only pending-campaign review list (Admin Review page).
 * Each row shows Brand Name, Budget, Rate, Platform and funded status,
 * with Approve / Reject buttons. Approve only after the brand's $500+
 * budget has actually reached the owner.
 */
export default function AdminCampaignList({
  campaigns,
}: {
  campaigns: Campaign[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { showError, showSuccess } = useToast();

  async function act(campaign: Campaign, action: "approve" | "reject") {
    setBusyId(campaign.id);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, action }),
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
      showError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
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
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
                c.is_funded
                  ? "bg-lime/15 text-lime"
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
                {PLATFORM_LABELS[c.platform] ?? c.platform}
              </p>
            </div>
          </div>

          {c.description && (
            <p className="mt-3 text-sm leading-relaxed text-fg/60">
              {c.description}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => void act(c, "approve")}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-lime py-2.5 text-sm font-black text-black transition hover:bg-limedark disabled:opacity-40"
            >
              {busyId === c.id ? (
                <>
                  <Spinner /> Working…
                </>
              ) : (
                "Approve — go live"
              )}
            </button>
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => void act(c, "reject")}
              className="flex-1 rounded-full border border-red-400/40 py-2.5 text-sm font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
