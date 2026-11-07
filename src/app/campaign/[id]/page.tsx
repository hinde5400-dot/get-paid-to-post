import { notFound } from "next/navigation";
import Link from "next/link";
import { getCampaign, getUserSubmissions } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import SubmitBundleForm, { type LastSubmission } from "@/components/SubmitBundleForm";
import CampaignBanner from "@/components/CampaignBanner";
import { PlatformChips } from "@/components/PlatformIcons";
import { formatUSD } from "@/lib/money";
import { PLATFORM_LABELS } from "@/lib/constants";
import { VIDEO_RULES } from "@/lib/validate";
import type { Platform } from "@/lib/types";

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const campaign = await getCampaign(params.id);
  if (!campaign) notFound();

  const user = await getCurrentUser();
  let lastByPlatform: LastSubmission[] = [];
  let userPostCount = 0;
  if (user) {
    const subs = await getUserSubmissions(user.id);
    const mine = subs.filter((s) => s.campaign_id === campaign.id);
    userPostCount = mine.length;
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

  const spentPct = Math.min(
    100,
    Math.round(
      ((campaign.budget_total - campaign.budget_left) / campaign.budget_total) *
        100
    )
  );

  return (
    <div className="space-y-6">
      <Link
        href="/campaigns"
        className="text-sm font-bold text-sun hover:underline"
      >
        ← Back to campaigns
      </Link>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-card">
        <CampaignBanner campaign={campaign} size="lg" />
        <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-sun">
              {campaign.brand_name} · {campaign.category} ·{" "}
              {PLATFORM_LABELS[campaign.platform]}
            </p>
            <PlatformChips platform={campaign.platform} />
          </div>
          <h1 className="mt-2 font-display text-3xl font-black uppercase leading-tight tracking-tight text-white md:text-4xl">
            {campaign.title}
          </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
          {campaign.description}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Earn up to</p>
            <p className="mt-1 text-2xl font-black text-sun">
              {formatUSD(campaign.earn_up_to)}
              <span className="text-sm font-semibold text-white/60"> / post</span>
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Base pay</p>
            <p className="mt-1 text-2xl font-black text-white">
              {formatUSD(campaign.base_pay)}
              <span className="text-sm font-semibold text-white/60"> / approved post</span>
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">View bonus</p>
            <p className="mt-1 text-2xl font-black text-white">
              {formatUSD(campaign.view_bonus_per_1k)}
              <span className="text-sm font-semibold text-white/60"> / 1K views</span>
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-white/50">Rate</p>
            <p className="mt-1 text-2xl font-black text-white">
              {formatUSD(campaign.rate_per_1m)}
              <span className="text-sm font-semibold text-white/60"> / 1M views</span>
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex justify-between text-sm text-white/60">
            <span>
              {formatUSD(campaign.budget_total - campaign.budget_left)} of{" "}
              {formatUSD(campaign.budget_total)} funded
            </span>
            <span>{spentPct}% used</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-sun"
              style={{ width: `${spentPct}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/70">
            <span>👀 Views tracked {campaign.views_tracked_days} days</span>
            <span>📹 Max posts: {campaign.max_posts}</span>
            <span>🎯 {campaign.spots_left} spots left</span>
          </div>
        </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-card p-6">
            <h2 className="text-lg font-extrabold text-white">About this campaign</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/70">
              <li>• Post a short vertical clip about {campaign.brand_name} on TikTok, Instagram or YouTube.</li>
              <li>• You are paid per real view — no follower minimum.</li>
              <li>• Approved earnings move to your wallet after a 72-hour hold.</li>
              <li>• Withdraw from $10 via USDT, Pakistani bank, or Wise (7% fee).</li>
              <li>• Fake engagement will lead to your account being strictly blocked or banned.</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-card p-6">
            <h2 className="text-lg font-extrabold text-white">Brief &amp; guidelines</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              {campaign.rules ??
                `Create an original clip for ${campaign.brand_name}. Keep it fun, honest and on-brand. Show the product clearly, follow the video rules below, and submit your TikTok and Instagram links together as one bundle.`}
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-white/70">
              {VIDEO_RULES.map((r) => (
                <li key={r}>✓ {r}</li>
              ))}
            </ul>
          </div>
        </div>

        <SubmitBundleForm
          campaign={campaign}
          lastByPlatform={lastByPlatform}
          isLoggedIn={Boolean(user)}
          userPostCount={userPostCount}
        />
      </div>
    </div>
  );
}
