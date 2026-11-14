"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Campaign } from "@/lib/types";
import { campaignPlatforms } from "@/lib/types";
import type { CampaignStats } from "@/lib/data";
import { isCampaignLive } from "@/lib/campaigns";
import { formatUSD, formatTimeLeft } from "@/lib/money";
import {
  budgetBarClass,
  budgetUsedPct,
  budgetDaysLeft,
  formatDeadline,
  payoutForViews,
  rateRangeText,
} from "@/lib/money";
import CampaignBanner from "./CampaignBanner";
import { PlatformChips } from "./PlatformIcons";

/**
 * Campaign popup modal. Clicking a campaign card opens
 * this instead of navigating away: banner, description, budget bar,
 * a real approval rate (approved / total submissions — omitted when
 * there are no submissions yet, never invented), a big lime
 * "Submit a clip" button (to the detail page's submit form) and a
 * "View campaign" button. Closes on X, overlay tap, or Escape.
 * A settling campaign (ended, still in its settlement window) shows
 * a Completed badge with "Campaign Review" below it and no Join
 * button — submissions are closed.
 */
export default function CampaignModal({
  campaign,
  stats,
  onClose,
}: {
  campaign: Campaign;
  stats: CampaignStats | null;
  onClose: () => void;
}) {
  // Budget is shown as % USED ONLY — never a $ amount
  // (Turn's decision, P0 batch 2; flipped from % remaining
  // 2026-11-10). The bar FILLS as the budget is used.
  const usedPct = budgetUsedPct(campaign.budget_total, campaign.budget_left);
  // "Ended" is decided on the UNROUNDED usage: the budget is truly
  // spent only when budget_left is 0. The rounded display value
  // (99.6% → 100) must never label a still-live campaign ended.
  const budgetFullyUsed = campaign.budget_left <= 0;
  const approvalPct =
    stats && stats.total > 0
      ? Math.round((stats.approved / stats.total) * 100)
      : null;
  const timeLeft = formatTimeLeft(campaign.ends_at);
  // "Time left at current rate" (P1-a): burn basis only here — the
  // deadline fallback is already shown as the countdown / deadline
  // below, so it is not repeated.
  const live = isCampaignLive(campaign);
  const burn = live ? budgetDaysLeft(campaign) : null;
  const burnText =
    burn && burn.basis === "burn"
      ? `~${burn.days} ${burn.days === 1 ? "day" : "days"} left at current rate`
      : null;
  const deadline = formatDeadline(campaign.ends_at);
  // 20k example with the per-post cap applied, like the 50k example.
  const example20k = payoutForViews(
    20000,
    campaign.view_bonus_per_1k,
    campaign.max_payout_per_post
  );

  // Close on Escape, and lock body scroll while the modal is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="animate-modal-in relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <div className="relative">
          <CampaignBanner
            campaign={campaign}
            badge={`Up to ${formatUSD(campaign.max_payout_per_post)} per post`}
            isLive={live}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-12 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-xl text-white transition hover:bg-black"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-limeink">
            {campaign.brand_name} · {campaign.category}
          </p>
          <h2 className="mt-1 font-display text-2xl font-black leading-tight tracking-tight text-fg">
            {campaign.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg/70">
            {campaign.description}
          </p>

          {/* Budget bar — % used only, never $ amounts */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-bold text-fg">
                {budgetFullyUsed
                  ? "Campaign ended"
                  : `${usedPct}% budget used`}
              </span>
              <span className="text-xs font-bold text-fg/60">
                {usedPct}%
              </span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-fg/10">
              <div
                className={`h-full rounded-full ${budgetBarClass(usedPct)}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>

          {/* Facts row */}
          <div className="mt-5 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl bg-fg/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
                Per 1K views
              </p>
              <p className="mt-1 font-display text-lg font-black text-fg">
                {formatUSD(campaign.view_bonus_per_1k)}
              </p>
            </div>
            <div className="rounded-2xl bg-fg/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
                Max per post
              </p>
              <p className="mt-1 font-display text-lg font-black text-limeink">
                {formatUSD(campaign.max_payout_per_post)}
              </p>
            </div>
            <div className="rounded-2xl bg-fg/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
                Creators
              </p>
              <p className="mt-1 font-display text-lg font-black text-fg">
                {stats ? stats.members : "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-fg/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
                Deadline
              </p>
              <p className="mt-1 font-display text-lg font-black text-fg">
                {live ? deadline : "Ended"}
              </p>
            </div>
          </div>

          {/* Status badge */}
          <p className="mt-4">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                live
                  ? "bg-lime/15 text-limeink"
                  : "bg-amber-400/15 text-amber-300"
              }`}
            >
              {live ? "● Live" : "● Completed"}
            </span>
          </p>
          {!live && (
            <p className="mt-1.5 text-xs font-bold text-amber-300">
              Campaign Review — payouts in progress
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <PlatformChips
              platform={campaign.platform}
              platforms={campaignPlatforms(campaign)}
            />
            {approvalPct !== null && (
              <span className="text-sm font-bold text-fg">
                <span className="text-limeink">{approvalPct}%</span> approved
                <span className="ml-1 text-xs font-medium text-fg/50">
                  ({stats!.approved} of {stats!.total})
                </span>
              </span>
            )}
          </div>
          <p className="mt-3 text-xs text-fg/50">
            Views tracked {campaign.views_tracked_days} days · Up to 15
            approved clips per platform · Min{" "}
            {Math.max(campaign.min_views, 1000).toLocaleString()} views per
            clip to earn
          </p>
          <p className="mt-2 text-xs font-semibold text-fg/70">
            {!live ? (
              <span className="font-bold text-amber-300">
                This campaign has ended and is now in Campaign Review
                — no new clips can be submitted. Approved earnings
                enter a 72-hour hold as soon as they are approved —
                even while the campaign is still running. After the
                campaign ends there is a 3-day re-check window, then
                payouts are made manually (about 1 week after the
                campaign ends in total).
              </span>
            ) : (
              <>
                {timeLeft ? (
                  <span className="font-bold text-limeink">⏳ {timeLeft}</span>
                ) : (
                  "Runs until the budget ends"
                )}
                {" · "}
                <>
                  Example: 20k views ×{" "}
                  {formatUSD(campaign.view_bonus_per_1k)} per 1k ={" "}
                  <span className="font-bold text-fg">
                    {formatUSD(example20k.earnings)} earned
                  </span>{" "}
                  (up to the per-post cap and the campaign&apos;s
                  remaining budget)
                </>
              </>
            )}
          </p>
          {burnText && (
            <p className="mt-1.5 text-xs font-bold text-limeink">
              ⏳ {burnText}
            </p>
          )}

          {live ? (
            <Link
              href={`/campaign/${campaign.id}#submit`}
              className="mt-6 block rounded-full bg-lime py-3.5 text-center text-base font-black text-black transition hover:bg-limedark"
            >
              Submit a clip →
            </Link>
          ) : (
            <p className="mt-6 rounded-2xl bg-amber-400/10 px-4 py-3 text-center text-sm font-semibold text-amber-300">
              Submissions are closed — this campaign has ended.
            </p>
          )}
          <Link
            href={`/campaign/${campaign.id}`}
            className="mt-3 block rounded-full border border-fg/20 py-3 text-center text-sm font-bold text-fg transition hover:border-lime hover:text-limeink"
          >
            View campaign
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
