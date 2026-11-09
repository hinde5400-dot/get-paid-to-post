import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCampaign,
  getCampaignStats,
  getUserSubmissions,
  isCampaignLive,
} from "@/lib/data";
import { getCurrentUser, getProfile, isOwner } from "@/lib/auth";
import SubmitBundleForm, { type LastSubmission } from "@/components/SubmitBundleForm";
import CampaignBanner, { BrandLogoTile } from "@/components/CampaignBanner";
import CampaignDetailTabs from "@/components/CampaignDetailTabs";
import { PlatformChips } from "@/components/PlatformIcons";
import { formatUSD, formatTimeLeft } from "@/lib/money";
import { budgetBarClass, budgetRemainingPct, payoutForViews } from "@/lib/money";
import { VIDEO_RULES } from "@/lib/validate";
import type { Platform } from "@/lib/types";
import { campaignPlatforms, platformNamesText } from "@/lib/types";

/**
 * Campaign detail, TryShoot brand-page style: brand profile
 * header (logo tile, brand name, real Members / Active counts, never
 * invented names), tabs Home / Apps / Chats / About, and a sticky
 * Join Shoot bar. The submit bundle form lives in the Home tab.
 */
export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const campaign = await getCampaign(params.id);
  if (!campaign) notFound();

  const user = await getCurrentUser();
  // Only live, funded campaigns are public — a pending, rejected,
  // unfunded, expired or out-of-budget campaign must never render
  // for creators. The owner can still preview any campaign from the
  // admin panel.
  if (!isCampaignLive(campaign)) {
    const profile = user ? await getProfile(user.id) : null;
    if (!isOwner(profile)) notFound();
  }
  const stats = await getCampaignStats(campaign.id);
  let lastByPlatform: LastSubmission[] = [];
  // Approved clips per platform for this creator on this campaign
  // (P0 batch 2): only status='approved' counts — rejected clips do
  // NOT count toward the 15-per-platform limit.
  let approvedByPlatform: Partial<Record<Platform, number>> = {};
  if (user) {
    const subs = await getUserSubmissions(user.id);
    const mine = subs.filter((s) => s.campaign_id === campaign.id);
    for (const s of mine) {
      if (s.status === "approved") {
        approvedByPlatform[s.platform] =
          (approvedByPlatform[s.platform] ?? 0) + 1;
      }
    }
    const latest = new Map<Platform, string>();
    for (const s of subs) {
      const prev = latest.get(s.platform);
      if (!prev || s.created_at > prev) latest.set(s.platform, s.created_at);
    }
    lastByPlatform = Array.from(latest.entries()).map(([platform, created_at]) => ({
      platform,
      created_at,
    }));
  }

  // Budget is shown as % remaining ONLY — never a $ amount
  // (Turn's decision, P0 batch 2).
  const remainingPct = budgetRemainingPct(
    campaign.budget_total,
    campaign.budget_left
  );
  // Payout example with the campaign's REAL rate and cap, so a creator
  // sees the exact math before filming.
  const example = payoutForViews(
    50000,
    campaign.view_bonus_per_1k,
    campaign.max_payout_per_post
  );
  const timeLeft = formatTimeLeft(campaign.ends_at);
  // 20k example with the per-post cap applied, like the 50k example.
  const example20k = payoutForViews(
    20000,
    campaign.view_bonus_per_1k,
    campaign.max_payout_per_post
  );
  // Platforms this campaign accepts (migration 0012), in prose form.
  const campaignPlatformsList = campaignPlatforms(campaign);
  const platformListText = platformNamesText(campaignPlatformsList);
  const submitHint =
    campaignPlatformsList.length === 1
      ? `submit your ${platformListText} link.`
      : `submit your ${platformListText} links together as one bundle.`;

  return (
    <div className="space-y-6 pb-20 md:pb-16">
      <Link
        href="/campaigns"
        className="text-sm font-bold text-lime hover:underline"
      >
        ← Back to campaigns
      </Link>

      {/* Brand profile header */}
      <div className="overflow-hidden rounded-3xl border border-fg/10 bg-card">
        <CampaignBanner
          campaign={campaign}
          size="lg"
          badge={`Up to ${formatUSD(campaign.max_payout_per_post)} per post`}
        />
        <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-4">
            <BrandLogoTile campaign={campaign} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-black uppercase leading-tight tracking-tight text-fg md:text-3xl">
                {campaign.brand_name}
              </h1>
              <p className="mt-0.5 text-sm font-bold text-fg/60">
                {stats
                  ? `${stats.members} Member${stats.members === 1 ? "" : "s"} · ${stats.active30d} Active`
                  : `${campaign.category} · ${platformListText}`}
              </p>
            </div>
            <PlatformChips
              platform={campaign.platform}
              platforms={campaignPlatformsList}
            />
          </div>

          <h2 className="mt-5 font-display text-xl font-black leading-snug tracking-tight text-fg md:text-2xl">
            {campaign.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/70">
            {campaign.description}
          </p>

          {/* Facts */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl bg-fg/5 p-4">
              <p className="text-xs text-fg/50">Earn up to</p>
              <p className="mt-1 text-2xl font-black text-lime">
                {formatUSD(campaign.max_payout_per_post)}
                <span className="text-sm font-semibold text-fg/60"> / post</span>
              </p>
            </div>
            <div className="rounded-2xl bg-fg/5 p-4">
              <p className="text-xs text-fg/50">View bonus</p>
              <p className="mt-1 text-2xl font-black text-fg">
                {formatUSD(campaign.view_bonus_per_1k)}
                <span className="text-sm font-semibold text-fg/60"> / 1K views</span>
              </p>
            </div>
            <div className="rounded-2xl bg-fg/5 p-4">
              <p className="text-xs text-fg/50">Rate</p>
              <p className="mt-1 text-2xl font-black text-fg">
                {formatUSD(campaign.rate_per_1m)}
                <span className="text-sm font-semibold text-fg/60"> / 1M views</span>
              </p>
            </div>
          </div>

          {/* Budget bar — % remaining only, never $ amounts */}
          <div className="mt-6">
            <div className="flex justify-between text-sm text-fg/60">
              <span>
                {remainingPct === 0
                  ? "Campaign ended"
                  : `${remainingPct}% budget remaining`}
              </span>
              <span>{remainingPct}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-fg/10">
              <div
                className={`h-full rounded-full ${budgetBarClass(remainingPct)}`}
                style={{ width: `${remainingPct}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-fg/70">
              <span>👀 Views tracked {campaign.views_tracked_days} days</span>
              <span>📹 Up to 15 approved clips per platform</span>
              <span className="font-bold text-lime">
                {timeLeft
                  ? `⏳ ${timeLeft}`
                  : "Runs until the budget ends"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <CampaignDetailTabs
        campaign={campaign}
        stats={stats}
        home={
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="rounded-3xl border border-fg/10 bg-card p-6">
                <h2 className="text-lg font-extrabold text-fg">About this campaign</h2>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg/70">
                  <li>• Post a short vertical clip about {campaign.brand_name} on {platformListText}.</li>
                  <li>• You are paid per real view — no follower minimum.</li>
                  <li>• Approved earnings move to your wallet after a 72-hour hold.</li>
                  <li>• Withdraw from $15 in USDT (TRC20 or BEP20) — 5% fee.</li>
                  <li>• Fake engagement will lead to your account being strictly blocked or banned.</li>
                </ul>
              </div>

              <div className="rounded-3xl border border-fg/10 bg-card p-6">
                <h2 className="text-lg font-extrabold text-fg">Brief &amp; guidelines</h2>
                <p className="mt-3 text-sm leading-relaxed text-fg/70">
                  {campaign.rules ??
                    `Create an original clip for ${campaign.brand_name}. Keep it fun, honest and on-brand. Show the product clearly, follow the video rules below, and ${submitHint}`}
                </p>
                <ul className="mt-4 space-y-1.5 text-sm text-fg/70">
                  {VIDEO_RULES.map((r) => (
                    <li key={r}>✓ {r}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl border border-lime/40 bg-card p-6">
                <h2 className="text-lg font-extrabold text-fg">How the payout works</h2>
                <p className="mt-3 text-sm leading-relaxed text-fg/70">
                  Your video got 50,000 views at{" "}
                  {formatUSD(campaign.view_bonus_per_1k)}/1k ={" "}
                  {formatUSD(example.uncapped)} earned.
                  {example.capped
                    ? ` Cap ${formatUSD(campaign.max_payout_per_post)} applied, you earned ${formatUSD(example.earnings)}.`
                    : ` You earned ${formatUSD(example.earnings)}.`}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-fg/70">
                  Example: 20,000 views ×{" "}
                  {formatUSD(campaign.view_bonus_per_1k)} per 1k ={" "}
                  <span className="font-bold text-fg">
                    {formatUSD(example20k.earnings)} earned
                  </span>
                  .
                </p>
                <p className="mt-2 text-sm leading-relaxed text-fg/70">
                  A creator never earns more than{" "}
                  {formatUSD(campaign.max_payout_per_post)} on one post,
                  even if the views would pay more. Approved earnings sit
                  in a 72-hour hold, then become withdrawable.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-fg/70">
                  When this campaign ends, a 3-day re-check window follows
                  — an approved video can still be rejected if fake or bot
                  views show up — then the 72-hour payment hold finishes
                  and payouts are made, about 1 week after the campaign
                  ends in total.
                </p>
              </div>
            </div>

            <div id="submit" className="scroll-mt-28">
              <SubmitBundleForm
                campaign={campaign}
                lastByPlatform={lastByPlatform}
                isLoggedIn={Boolean(user)}
                approvedByPlatform={approvedByPlatform}
              />
            </div>
          </div>
        }
        about={
          <div className="rounded-3xl border border-fg/10 bg-card p-6">
            <h2 className="font-display text-lg font-black tracking-tight text-fg">
              About {campaign.brand_name}
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ["Brand", campaign.brand_name],
                ["Category", campaign.category],
                ["Platforms", platformListText],
                ["Budget", `${remainingPct}% remaining`],
                ["Rate", `${formatUSD(campaign.rate_per_1m)} per 1M views`],
                ["View bonus", `${formatUSD(campaign.view_bonus_per_1k)} per 1K views`],
                ["Earn up to", `${formatUSD(campaign.max_payout_per_post)} per post`],
                ["Views tracked", `${campaign.views_tracked_days} days`],
                ["Clip limit", "Up to 15 approved clips per platform"],
                ["Status", campaign.is_funded ? "Funded & live" : "Not funded"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 border-b border-fg/5 pb-3 last:border-0 last:pb-0"
                >
                  <dt className="shrink-0 font-bold text-fg/50">{label}</dt>
                  <dd className="text-right font-bold text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        }
      />
    </div>
  );
}
