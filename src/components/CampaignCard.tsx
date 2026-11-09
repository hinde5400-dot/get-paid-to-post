"use client";

import { useEffect, useState } from "react";
import type { Campaign } from "@/lib/types";
import { campaignPlatforms } from "@/lib/types";
import { formatUSD, formatTimeLeft } from "@/lib/money";
import { budgetBarClass, budgetRemainingPct, payoutForViews } from "@/lib/money";
import CampaignBanner, { BrandLogoTile } from "./CampaignBanner";
import { PlatformChips } from "./PlatformIcons";

/**
 * TryShoot-style campaign card: big colourful banner on top with the
 * rate badge on it, brand row, title, budget progress bar, platform
 * chips and a lime View button. Clicking anywhere on the card opens
 * the campaign popup modal (via onOpen) instead of navigating away.
 * Shows a live countdown while the campaign runs, and an example
 * payout computed from the campaign's real rate.
 */
export default function CampaignCard({
  campaign,
  onOpen,
}: {
  campaign: Campaign;
  onOpen: () => void;
}) {
  // Budget is shown as % remaining ONLY — never a $ amount
  // (Turn's decision, P0 batch 2). The bar colour follows the %
  // remaining: >50% green, 25–50% yellow, 10–25% red, <10% dark red.
  const remainingPct = budgetRemainingPct(
    campaign.budget_total,
    campaign.budget_left
  );
  // Ticking clock for the countdown (re-renders every minute).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const timeLeft = formatTimeLeft(campaign.ends_at, now);
  // Example payout from the campaign's real rate, with the per-post
  // cap applied — same math as the 50k example, so it never
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
            {formatUSD(campaign.view_bonus_per_1k)} / 1K views
          </span>
        </div>

        {/* Title + description */}
        <h3 className="mt-4 font-display text-lg font-black leading-snug tracking-tight text-fg group-hover:text-lime">
          {campaign.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-fg/60">
          {campaign.description}
        </p>

        {/* Budget progress — % remaining only, never $ amounts */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-bold text-fg">
              {remainingPct === 0
                ? "Campaign ended"
                : `${remainingPct}% budget remaining`}
            </span>
            <span className="text-xs font-bold text-fg/60">
              {remainingPct}%
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fg/10">
            <div
              className={`h-full rounded-full ${budgetBarClass(remainingPct)}`}
              style={{ width: `${remainingPct}%` }}
            />
          </div>
          {/* Countdown + example payout (real rate, cap applied) */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            {timeLeft ? (
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
              </span>
            </span>
          </div>
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
