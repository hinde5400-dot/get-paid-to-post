"use client";

import type { Campaign } from "@/lib/types";
import { formatUSD } from "@/lib/money";
import CampaignBanner, { BrandLogoTile } from "./CampaignBanner";
import { PlatformChips } from "./PlatformIcons";

/**
 * TryShoot-style campaign card: big colourful banner on top with the
 * rate badge on it, brand row, title, budget progress bar, platform
 * chips and a lime View button. Clicking anywhere on the card opens
 * the campaign popup modal (via onOpen) instead of navigating away.
 */
export default function CampaignCard({
  campaign,
  onOpen,
}: {
  campaign: Campaign;
  onOpen: () => void;
}) {
  const spent = campaign.budget_total - campaign.budget_left;
  const fundedPct = Math.min(
    100,
    Math.round((spent / campaign.budget_total) * 100)
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
        badge={`${formatUSD(campaign.base_pay)} per post + milestones`}
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

        {/* Budget progress */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-bold text-fg">
              {formatUSD(spent)} of {formatUSD(campaign.budget_total)}
              <span className="ml-1 text-xs font-medium text-fg/50">
                funded
              </span>
            </span>
            <span className="text-xs font-bold text-fg/60">
              {fundedPct}%
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fg/10">
            <div
              className="h-full rounded-full bg-lime"
              style={{ width: `${fundedPct}%` }}
            />
          </div>
        </div>

        {/* Platform chips + spots */}
        <div className="mt-4 flex items-center justify-between">
          <PlatformChips platform={campaign.platform} />
          <span className="text-xs font-bold text-fg/60">
            {campaign.spots_left} spots left
          </span>
        </div>

        <span className="mt-4 block rounded-full bg-lime py-2.5 text-center text-sm font-black text-black transition group-hover:bg-limedark">
          View
        </span>
      </div>
    </article>
  );
}
