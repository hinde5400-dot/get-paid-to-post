"use client";

import { useEffect, useState } from "react";
import type { Campaign } from "@/lib/types";
import { campaignPlatforms } from "@/lib/types";
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
import CampaignBanner, { BrandLogoTile } from "./CampaignBanner";
import { PlatformChips } from "./PlatformIcons";

/**
 * TryShoot-style campaign card: big colourful banner on top with the
 * rate badge on it, brand row, title, budget progress bar, platform
 * chips and a lime View button. Clicking anywhere on the card opens
 * the campaign popup modal (via onOpen) instead of navigating away.
 * Shows a live countdown while the campaign runs, and an example
 * payout computed from the campaign's real rate.
 *
 * Card completeness (P1-a, Content Rewards model): rate per 1,000
 * views, max earning per post ("up to $X per post"), budget used as
 * % only (never $ amounts), creators count (distinct creators who
 * submitted — stats.members, passed in from the grid), Live /
 * Completed status badge, deadline, and "~X days left at current
 * rate" from the burn rate when payouts have started.
 */
export default function CampaignCard({
  campaign,
  onOpen,
  creatorsCount,
}: {
  campaign: Campaign;
  onOpen: () => void;
  /** Distinct creators who submitted to this campaign
   *  (stats.members); null when the stats could not be loaded. */
  creatorsCount?: number | null;
}) {
  // Budget is shown as % USED ONLY — never a $ amount
  // (Turn's decision, P0 batch 2; flipped from % remaining
  // 2026-11-10). The bar FILLS as the budget is used: green below
  // 50% used, yellow 50–75%, red 75–90%, dark red above 90%.
  const usedPct = budgetUsedPct(campaign.budget_total, campaign.budget_left);
  // "Ended" is decided on the UNROUNDED usage: the budget is truly
  // spent only when budget_left is 0. The rounded display value
  // (99.6% → 100) must never label a still-live campaign ended.
  const budgetFullyUsed = campaign.budget_left <= 0;
  // Ticking clock for the countdown (re-renders every minute).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const timeLeft = formatTimeLeft(campaign.ends_at, now);
  // "Time left at current rate" (P1-a): only shown when the burn
  // rate is real (payouts have started) — the deadline fallback is
  // already covered by the countdown above, so it is not repeated.
  const live = isCampaignLive(campaign, now);
  const burn = live ? budgetDaysLeft(campaign, now) : null;
  const burnText =
    burn && burn.basis === "burn"
      ? `~${burn.days} ${burn.days === 1 ? "day" : "days"} left at current rate`
      : null;
  const deadline = formatDeadline(campaign.ends_at, now);
  // Example payout from the campaign's real single rate, with the
  // per-post cap applied — same math as the 50k example, so it never
  // overstates earnings above the cap.
  const example20k = payoutForViews(
    20000,
    campaign.view_bonus_per_1k,
    campaign.max_payout_per_post
  );

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKey}
      aria-label={`View campaign: ${campaign.title}`}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-fg/10 bg-card transition hover:border-lime/60"
    >
      <CampaignBanner
        campaign={campaign}
        badge={`Up to ${formatUSD(campaign.max_payout_per_post)} per post`}
        isLive={live}
      />
      <div className="flex flex-1 flex-col p-5">
        {/* Brand row */}
        <div className="flex items-center gap-2.5">
          <BrandLogoTile campaign={campaign} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-fg">
              {campaign.brand_name}
            </span>
            <span className="block text-xs font-semibold text-fg/50">
              {campaign.category}
            </span>
          </span>
          <span className="ml-auto rounded-full bg-fg/10 px-2.5 py-1 text-[11px] font-bold text-fg/70">
            {rateRangeText(campaign)}
          </span>
        </div>

        {/* Title + description */}
        <h3 className="mt-4 font-display text-lg font-black leading-snug tracking-tight text-fg group-hover:text-lime">
          {campaign.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-fg/60">
          {campaign.description}
        </p>

        {/* Status + creators + deadline (P1-a card completeness) */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span
            className={`rounded-full px-2.5 py-1 ${
              live ? "bg-lime/15 text-lime" : "bg-amber-400/15 text-amber-300"
            }`}
          >
            {live ? "● Live" : "● Completed"}
          </span>
          {creatorsCount !== null && creatorsCount !== undefined && (
            <span className="rounded-full bg-fg/10 px-2.5 py-1 text-fg/70">
              {creatorsCount} creator{creatorsCount === 1 ? "" : "s"}
            </span>
          )}
          <span className="rounded-full bg-fg/10 px-2.5 py-1 text-fg/70">
            {live ? deadline : "Ended"}
          </span>
        </div>

        {/* Budget progress — % used only, never $ amounts */}
        <div className="mt-4">
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
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fg/10">
            <div
              className={`h-full rounded-full ${budgetBarClass(usedPct)}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          {/* Countdown + example payout (real rate, cap applied) */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            {!live ? (
              <span className="font-bold text-amber-300">
                Campaign Review — payouts in progress
              </span>
            ) : timeLeft ? (
              <span className="font-bold text-lime">⏳ {timeLeft}</span>
            ) : (
              <span className="font-bold text-fg/60">
                Runs until the budget ends
              </span>
            )}
            <span className="font-semibold text-fg/60">
              20k views × {formatUSD(campaign.view_bonus_per_1k)} per 1k ={" "}
              <span className="font-bold text-fg">
                {formatUSD(example20k.earnings)} earned
              </span>{" "}
              (up to the per-post cap and the campaign&apos;s remaining
              budget)
            </span>
          </div>
          {burnText && (
            <p className="mt-1.5 text-xs font-bold text-lime">
              ⏳ {burnText}
            </p>
          )}
        </div>

        {/* Platform chips + per-post cap */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <PlatformChips
            platform={campaign.platform}
            platforms={campaignPlatforms(campaign)}
          />
          <span className="shrink-0 rounded-full bg-lime/15 px-2.5 py-1 text-[11px] font-black text-lime">
            Up to {formatUSD(campaign.max_payout_per_post)} / post
          </span>
        </div>

        <span className="mt-4 block rounded-full bg-lime py-2.5 text-center text-sm font-black text-black transition group-hover:bg-limedark">
          View
        </span>
      </div>
    </article>
  );
}
