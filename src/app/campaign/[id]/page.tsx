import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCampaign,
  getCampaignStats,
  getCampaignTopClippers,
  getUserSubmissions,
  isCampaignLive,
  isCampaignSettling,
} from "@/lib/data";
import { getCurrentUser, getProfile, isOwner } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import SubmitBundleForm, { type LastSubmission } from "@/components/SubmitBundleForm";
import CampaignBanner, { BrandLogoTile } from "@/components/CampaignBanner";
import CampaignDetailTabs from "@/components/CampaignDetailTabs";
import WinBoard from "@/components/WinBoard";
import { PlatformChips } from "@/components/PlatformIcons";
import { formatUSD, formatTimeLeft } from "@/lib/money";
import {
  budgetBarClass,
  budgetUsedPct,
  budgetTimeLeftText,
  formatDeadline,
  payoutForViews,
  rateRangeText,
} from "@/lib/money";
import { VIDEO_RULES } from "@/lib/validate";
import type { Platform } from "@/lib/types";
import { campaignPlatforms, platformNamesText } from "@/lib/types";
import { getBrandCampaignClips, type BrandCampaignClip } from "@/lib/brand-clips";

/**
 * Campaign detail: brand profile header (logo tile, brand name,
 * real Members / Active counts, never invented names), tabs Home /
 * Apps / Chats / About, and a sticky Submit bar. The submit bundle
 * form lives in the Home tab.
 */
export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const campaign = await getCampaign(params.id);
  if (!campaign) notFound();

  const user = await getCurrentUser();
  // Only live, funded campaigns are public — a pending, rejected or
  // unfunded campaign must never render for creators. The owner can
  // still preview any campaign from the admin panel.
  // SETTLING (P1-a): an ended campaign that has not been auto-deleted
  // yet (cleanup deletes >= 7 days after the end, migration 0023)
  // DOES render for everyone — with a Completed / Campaign Review
  // notice and NO submit form. After the cleanup deletes it,
  // getCampaign returns null and the page 404s as before.
  const live = isCampaignLive(campaign);
  const settling = isCampaignSettling(campaign);
  const isBrandOwner = user !== null && campaign.user_id === user.id;
  if (!live && !settling) {
    const profile = user ? await getProfile(user.id) : null;
    // The site owner can preview any campaign; the brand that owns
    // this campaign can preview its own pending campaign (it must
    // NOT appear on public Discover until live).
    if (!isOwner(profile) && !isBrandOwner) notFound();
  }
  const isPreview = !live && !settling;
  const stats = await getCampaignStats(campaign.id);
  // Win Board for this campaign: real top earners from approved
  // clips only — empty (all counts 0) until the first clip here
  // is approved.
  const topClippers = await getCampaignTopClippers(campaign.id, 5);
  // Round-4 P1-B3: the brand owner sees each clip of its own
  // campaign in the Apps tab. Best-effort — a failed load reads
  // as "no clips" and the page still renders.
  let brandClips: BrandCampaignClip[] | null = null;
  let clipsUnavailable = false;
  if (isBrandOwner) {
    try {
      const loaded = await getBrandCampaignClips(campaign.id, user.id);
      brandClips = loaded.clips;
      clipsUnavailable = loaded.unavailable;
    } catch {
      brandClips = null;
      clipsUnavailable = false;
    }
  }
  let lastByPlatform: LastSubmission[] = [];
  // Approved clips per platform for this creator on this campaign
  // (P0 batch 2): only status='approved' counts — rejected clips do
  // NOT count toward the 15-per-platform limit.
  let approvedByPlatform: Partial<Record<Platform, number>> = {};
  if (user) {
    // Forms #26: getUserSubmissions THROWS on DB error. These rows
    // only drive the cooldown hint and the approved-count display —
    // a failed lookup reads as "no submissions" and the page still
    // renders; the API enforces the real limits at submit time.
    let subs: Awaited<ReturnType<typeof getUserSubmissions>> = [];
    try {
      subs = await getUserSubmissions(user.id);
    } catch {
      subs = [];
    }
    const mine = subs.filter((s) => s.campaign_id === campaign.id);
    for (const s of mine) {
      if (s.status === "approved") {
        approvedByPlatform[s.platform] =
          (approvedByPlatform[s.platform] ?? 0) + 1;
      }
    }
    const latest = new Map<Platform, string>();
    for (const s of subs) {
      // Cooldown counts only live submissions (pending or
      // approved) — a rejected or duplicate submission does not
      // start the 2-hour cooldown.
      if (s.status === "rejected") continue;
      const prev = latest.get(s.platform);
      if (!prev || s.created_at > prev) latest.set(s.platform, s.created_at);
    }
    lastByPlatform = Array.from(latest.entries()).map(([platform, created_at]) => ({
      platform,
      created_at,
    }));
  }
  // OAuth connection state, so the submit form can warn (not
  // block) when TikTok/YouTube is not connected yet — the API is
  // the enforcer, this is only the early warning. A failed lookup
  // reads as "not connected" (the hint shows), never as connected.
  let tiktokConnected: boolean | undefined;
  let youtubeConnected: boolean | undefined;
  if (user) {
    const supabase = getServerClient();
    if (supabase) {
      const [{ data: tk }, { data: yt }] = await Promise.all([
        supabase
          .from("tiktok_connections")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("youtube_connections")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle(),
      ]);
      tiktokConnected = Boolean(tk);
      youtubeConnected = Boolean(yt);
    }
  }

  // Budget is shown as % USED ONLY — never a $ amount
  // (Turn's decision, P0 batch 2; flipped from % remaining
  // 2026-11-10). The bar FILLS as the budget is used.
  const usedPct = budgetUsedPct(campaign.budget_total, campaign.budget_left);
  // "Ended" is decided on the UNROUNDED usage: the budget is truly
  // spent only when budget_left is 0. The rounded display value
  // (99.6% → 100) must never label a still-live campaign ended.
  const budgetFullyUsed = campaign.budget_left <= 0;
  // Payout examples with the campaign's REAL single rate and cap,
  // so a creator sees the exact math before filming. One rate per
  // 1,000 views for the whole campaign — the same on every platform.
  const headlineRate = campaign.view_bonus_per_1k;
  const example = payoutForViews(
    50000,
    headlineRate,
    campaign.max_payout_per_post
  );
  const timeLeft = formatTimeLeft(campaign.ends_at);
  // "Time left at current rate" (P1-a) — burn rate when payouts have
  // started, days until the deadline otherwise, "—" when neither
  // exists. Only meaningful while the campaign is live.
  const budgetTimeLeft = live ? budgetTimeLeftText(campaign) : null;
  const deadline = formatDeadline(campaign.ends_at);
  // 20k example with the per-post cap applied, like the 50k example.
  const example20k = payoutForViews(
    20000,
    headlineRate,
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

      {/* Preview notice: this campaign is not live yet — only its
          brand owner and the site owner can see this page. Creators
          cannot see it on Discover, and no clips can be submitted.
          A REJECTED campaign shows "Rejected" plainly — never the
          pay-to-go-live copy, which would read as "pay and it goes
          live" for a campaign that will never be approved. */}
      {isPreview && campaign.status === "rejected" && (
        <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-6">
          <p className="font-display text-lg font-black tracking-tight text-red-300">
            ● Rejected — this campaign will not go live
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg/70">
            This campaign was rejected by the admin and will not go
            live.
          </p>
        </div>
      )}
      {isPreview && campaign.status !== "rejected" && (
        <div className="rounded-3xl border border-amber-400/40 bg-amber-400/10 p-6">
          <p className="font-display text-lg font-black tracking-tight text-amber-300">
            ● Preview — this campaign is not live yet
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg/70">
            Only you (the brand) and the site owner can see this page.
            The campaign stays hidden from Discover until its budget
            plus the 15% platform fee is sent and the admin verifies
            payment. No clips can be submitted yet.
          </p>
        </div>
      )}

      {/* Completed notice (P1-a): the campaign ended but is still in
          its settlement window — visible, no new submissions. */}
      {settling && (
        <div className="rounded-3xl border border-amber-400/40 bg-amber-400/10 p-6">
          <p className="font-display text-lg font-black tracking-tight text-amber-300">
            ● Completed — this campaign has ended
          </p>
          <p className="mt-1 text-sm font-bold text-amber-300">
            Campaign Review — payouts in progress
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg/70">
            No new clips can be submitted. Approved earnings enter a
            72-hour hold as soon as they are approved — even while the
            campaign is still running. After the campaign ends there
            is a 3-day re-check window, during which an approved video
            can still be rejected if fake or bot views show up, then
            payouts are made manually (about 1 week after the campaign
            ends in total). The campaign, its proofs and its chat are
            deleted 1 day after the last hold matures, never earlier
            than 7 days after the campaign ends. Wallet and withdrawal
            records are never deleted. This campaign will be removed
            automatically after the settlement window.
          </p>
        </div>
      )}

      {/* Brand profile header */}
      <div className="overflow-hidden rounded-3xl border border-fg/10 bg-card">
        <CampaignBanner
          campaign={campaign}
          size="lg"
          badge={`Up to ${formatUSD(campaign.max_payout_per_post)} per post`}
          isLive={live}
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
                  ? `${live ? "Live" : settling ? "Completed" : "Not live"} · ${stats.members} Member${stats.members === 1 ? "" : "s"}`
                  : `${campaign.category} · ${platformListText}`}
              </p>
              <p className="mt-1 text-sm font-bold text-fg/60">
                {live ? deadline : settling ? "Ended" : deadline}
                {budgetTimeLeft ? ` · ${budgetTimeLeft}` : ""}
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
              <p className="mt-1 text-xs font-semibold text-fg/60">
                One rate for the whole campaign — same on every platform
              </p>
            </div>
          </div>

          {/* Budget bar — % used only, never $ amounts */}
          <div className="mt-6">
            <div className="flex justify-between text-sm text-fg/60">
              <span>
                {budgetFullyUsed
                  ? "Campaign ended"
                  : `${usedPct}% budget used`}
              </span>
              <span>{usedPct}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-fg/10">
              <div
                className={`h-full rounded-full ${budgetBarClass(usedPct)}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-fg/70">
              <span>👀 Views tracked {campaign.views_tracked_days} days</span>
              <span>📹 Up to 15 approved clips per platform</span>
              <span>
                🎯 Min{" "}
                {Math.max(campaign.min_views, 1000).toLocaleString()} views
                per clip to earn
              </span>
              {stats && (
                <span>
                  👥 {stats.members} creator{stats.members === 1 ? "" : "s"}
                </span>
              )}
              <span className="font-bold text-lime">
                {settling
                  ? "Campaign Review — payouts in progress"
                  : timeLeft
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
        brandClips={brandClips}
        isBrandOwner={isBrandOwner}
        clipsUnavailable={clipsUnavailable}
        home={
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="rounded-3xl border border-fg/10 bg-card p-6">
                <h2 className="text-lg font-extrabold text-fg">About this campaign</h2>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg/70">
                  <li>• Post a short vertical clip about {campaign.brand_name} on {platformListText}.</li>
                  <li>• You are paid per real view — no follower minimum.</li>
                  <li>• Approved earnings move to your wallet after a 72-hour hold.</li>
                  <li>• Withdraw from $15 in USDT (TRC20 only) — 5% fee.</li>
                  <li>• Fake engagement will lead to your account being strictly blocked or banned.</li>
                </ul>
              </div>

              <div className="rounded-3xl border border-fg/10 bg-card p-6">
                <h2 className="text-lg font-extrabold text-fg">Brief &amp; guidelines</h2>
                <p className="mt-3 text-sm leading-relaxed text-fg/70">
                  {campaign.rules ??
                    `Create an original clip for ${campaign.brand_name}. Keep it fun, honest and on-brand. Show the product clearly, follow the video rules below, and ${submitHint}`}
                </p>
                {campaign.brief_url && (
                  <p className="mt-3">
                    <a
                      href={campaign.brief_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-bold text-lime hover:underline"
                    >
                      Open the campaign brief (Google Drive) ↗
                    </a>
                  </p>
                )}
                <ul className="mt-4 space-y-1.5 text-sm text-fg/70">
                  {VIDEO_RULES.map((r) => (
                    <li key={r}>✓ {r}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl border border-lime/40 bg-card p-6">
                <h2 className="text-lg font-extrabold text-fg">How the payout works</h2>
                <p className="mt-3 text-sm leading-relaxed text-fg/70">
                  Example: your video got 50,000 views at{" "}
                  {formatUSD(campaign.view_bonus_per_1k)}/1k ={" "}
                  {formatUSD(example.uncapped)} earned.
                  {example.capped
                    ? ` Cap ${formatUSD(campaign.max_payout_per_post)} applied, you earned ${formatUSD(example.earnings)}.`
                    : ` You earned ${formatUSD(example.earnings)}.`}{" "}
                  (Up to the per-post cap and the campaign&apos;s
                  remaining budget.)
                </p>
                <p className="mt-2 text-sm leading-relaxed text-fg/70">
                  Example: 20,000 views ×{" "}
                  {formatUSD(campaign.view_bonus_per_1k)} per 1k ={" "}
                  <span className="font-bold text-fg">
                    {formatUSD(example20k.earnings)} earned
                  </span>{" "}
                  (up to the per-post cap and the campaign&apos;s
                  remaining budget).
                </p>
                <p className="mt-2 text-sm leading-relaxed text-fg/70">
                  A creator never earns more than{" "}
                  {formatUSD(campaign.max_payout_per_post)} on one post,
                  even if the views would pay more.{" "}Your clip needs at least{" "}
                  {Math.max(campaign.min_views, 1000).toLocaleString()}{" "}
                  views before it can earn — a clip below the
                  campaign&apos;s minimum cannot be approved.{" "}
                  Approved earnings enter a 72-hour hold as soon as
                  they are approved — even while the campaign is still
                  running — then become withdrawable.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-fg/70">
                  When this campaign ends, a 3-day re-check window follows
                  — an approved video can still be rejected if fake or bot
                  views show up — then payouts are made manually, about
                  1 week after the campaign ends in total. The campaign,
                  its proofs and its chat are deleted 1 day after the
                  last hold matures, never earlier than 7 days after the
                  campaign ends. Wallet and withdrawal records are never
                  deleted.
                </p>
              </div>
            </div>

            <div id="submit" className="scroll-mt-28">
              {settling ? (
                <div className="rounded-3xl border border-amber-400/40 bg-card p-6">
                  <h2 className="text-lg font-extrabold text-fg">
                    Submissions are closed
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-fg/70">
                    This campaign has ended and is now in Campaign
                    Review. No new clips can be submitted. Approved
                    earnings enter a 72-hour hold as soon as they are
                    approved — even while the campaign is still
                    running. After the campaign ends there is a 3-day
                    re-check window, then payouts are made manually
                    (about 1 week after the campaign ends in total).
                    The campaign, its proofs and its chat are deleted
                    1 day after the last hold matures, never earlier
                    than 7 days after the campaign ends. Wallet and
                    withdrawal records are never deleted.
                  </p>
                </div>
              ) : isPreview ? (
                <div className="rounded-3xl border border-amber-400/40 bg-card p-6">
                  <h2 className="text-lg font-extrabold text-fg">
                    {campaign.status === "rejected"
                      ? "Rejected"
                      : "Not live yet"}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-fg/70">
                    {campaign.status === "rejected"
                      ? "This campaign was rejected by the admin and will not go live."
                      : "This campaign is still pending — it opens to creators only after its budget is funded and the admin verifies payment. No clips can be submitted yet."}
                  </p>
                </div>
              ) : (
                <SubmitBundleForm
                  campaign={campaign}
                  lastByPlatform={lastByPlatform}
                  isLoggedIn={Boolean(user)}
                  approvedByPlatform={approvedByPlatform}
                  tiktokConnected={tiktokConnected}
                  youtubeConnected={youtubeConnected}
                />
              )}
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
                ["Budget", `${usedPct}% used`],
                ["View bonus", `${formatUSD(campaign.view_bonus_per_1k)} per 1K views on every platform`],
                [
                  "Minimum views per clip",
                  `${Math.max(campaign.min_views, 1000).toLocaleString()} views`,
                ],
                ["Earn up to", `${formatUSD(campaign.max_payout_per_post)} per post`],
                ["Creators", stats ? `${stats.members}` : "—"],
                ["Active creators (30 days)", stats ? `${stats.active30d}` : "—"],
                ["Deadline", live || !campaign.ends_at ? deadline : "Ended"],
                ["Budget time left", budgetTimeLeft ?? "—"],
                ["Views tracked", `${campaign.views_tracked_days} days`],
                ["Clip limit", "Up to 15 approved clips per platform"],
                [
                  "Status",
                  campaign.status === "rejected"
                    ? "Rejected"
                    : !campaign.is_funded
                      ? "Not funded"
                      : live
                        ? "Funded & live"
                        : settling
                          ? "Completed — payouts in progress"
                          : "Funded",
                ],
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
            {campaign.brief_url && (
              <p className="mt-4">
                <a
                  href={campaign.brief_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-bold text-lime hover:underline"
                >
                  Open the campaign brief (Google Drive) ↗
                </a>
              </p>
            )}
          </div>
        }
      />

      <WinBoard
        entries={topClippers}
        title="Top Clippers on this campaign"
        subtitle="Creators who earned the most from this campaign's approved clips."
      />
    </div>
  );
}
