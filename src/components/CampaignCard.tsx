import Link from "next/link";
import type { Campaign } from "@/lib/types";
import { formatUSD } from "@/lib/money";
import { PLATFORM_LABELS } from "@/lib/constants";

export default function CampaignCard({ campaign }: { campaign: Campaign }) {
  const spentPct = Math.min(
    100,
    Math.round(
      ((campaign.budget_total - campaign.budget_left) / campaign.budget_total) *
        100
    )
  );
  return (
    <Link
      href={`/campaign/${campaign.id}`}
      className="group block overflow-hidden rounded-2xl border border-white/10 bg-card transition hover:border-sun/60"
    >
      <div className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sun">
            {campaign.brand_name} · {campaign.category}
          </p>
          <h3 className="mt-1 text-lg font-bold leading-snug text-white group-hover:text-sun">
            {campaign.title}
          </h3>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/80">
          {PLATFORM_LABELS[campaign.platform]}
        </span>
      </div>
      <div className="px-5 pb-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-white/50">Earn up to</p>
            <p className="text-2xl font-black text-sun">
              {formatUSD(campaign.earn_up_to)}
              <span className="text-sm font-semibold text-white/60"> / post</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/50">Rate</p>
            <p className="text-sm font-bold text-white">
              {formatUSD(campaign.rate_per_1m)} / 1M views
            </p>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-white/60">
            <span>
              Budget {formatUSD(campaign.budget_left)} left of{" "}
              {formatUSD(campaign.budget_total)}
            </span>
            <span>{spentPct}% used</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-sun"
              style={{ width: `${spentPct}%` }}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-white/60">
          <span>
            Base pay {formatUSD(campaign.base_pay)} · +{formatUSD(campaign.view_bonus_per_1k)} / 1K
            views
          </span>
          <span className="font-bold text-white">
            {campaign.spots_left} spots left
          </span>
        </div>
      </div>
    </Link>
  );
}
