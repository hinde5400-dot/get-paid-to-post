import Link from "next/link";
import type { Campaign } from "@/lib/types";
import { formatUSD } from "@/lib/money";
import CampaignBanner from "./CampaignBanner";
import { PlatformChips } from "./PlatformIcons";

/**
 * TryShoot-style campaign card: big typographic banner graphic, a rate
 * pill, brand row, short description, budget progress bar, platform
 * chips and a bright yellow View button.
 */
export default function CampaignCard({ campaign }: { campaign: Campaign }) {
  const spent = campaign.budget_total - campaign.budget_left;
  const fundedPct = Math.min(
    100,
    Math.round((spent / campaign.budget_total) * 100)
  );
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-card transition hover:border-sun/60">
      <Link href={`/campaign/${campaign.id}`} className="block">
        <CampaignBanner campaign={campaign} />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        {/* Rate pill */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sun px-3 py-1.5 text-xs font-black text-black">
            {formatUSD(campaign.base_pay)} per post +{" "}
            {formatUSD(campaign.view_bonus_per_1k)} / 1K views
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/70">
            Earn up to {formatUSD(campaign.earn_up_to)} / post
          </span>
        </div>

        {/* Brand row + title */}
        <Link href={`/campaign/${campaign.id}`} className="mt-4 block">
          <p className="text-xs font-bold uppercase tracking-wider text-sun">
            {campaign.brand_name} · {campaign.category}
          </p>
          <h3 className="mt-1 font-display text-lg font-black leading-snug tracking-tight text-white group-hover:text-sun">
            {campaign.title}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-white/60">
            {campaign.description}
          </p>
        </Link>

        {/* Budget progress */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-bold text-white">
              {formatUSD(spent)} of {formatUSD(campaign.budget_total)}
              <span className="ml-1 text-xs font-medium text-white/50">
                funded
              </span>
            </span>
            <span className="text-xs font-bold text-white/60">
              {fundedPct}%
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-sun"
              style={{ width: `${fundedPct}%` }}
            />
          </div>
        </div>

        {/* Platform chips + spots */}
        <div className="mt-4 flex items-center justify-between">
          <PlatformChips platform={campaign.platform} />
          <span className="text-xs font-bold text-white/60">
            {campaign.spots_left} spots left
          </span>
        </div>

        <Link
          href={`/campaign/${campaign.id}`}
          className="mt-4 block rounded-full bg-sun py-2.5 text-center text-sm font-black text-black transition hover:bg-sundark"
        >
          View
        </Link>
      </div>
    </article>
  );
}
