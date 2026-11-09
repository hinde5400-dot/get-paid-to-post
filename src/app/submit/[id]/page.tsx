import { notFound } from "next/navigation";
import Link from "next/link";
import { getCampaign, getUserSubmissions, isCampaignLive } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import SubmitBundleForm, { type LastSubmission } from "@/components/SubmitBundleForm";
import type { Platform } from "@/lib/types";

export default async function SubmitPage({
  params,
}: {
  params: { id: string };
}) {
  const campaign = await getCampaign(params.id);
  if (!campaign) notFound();

  // No working form for a campaign that is not live — pending,
  // rejected, ended (duration passed) or out of budget. The API
  // enforces the same check, so this is the honest face of it.
  if (!isCampaignLive(campaign)) {
    const ended =
      (campaign.ends_at &&
        new Date(campaign.ends_at).getTime() <= Date.now()) ||
      campaign.budget_left <= 0;
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">
            {ended ? "This campaign has ended" : "This campaign is not live"}
          </h1>
          <p className="mt-2 text-sm text-fg/60">
            {campaign.brand_name} — {campaign.title}
          </p>
        </div>
        <div className="rounded-2xl border border-fg/10 bg-card p-8 text-center">
          <p className="font-bold text-fg">
            {ended
              ? "This campaign has ended, so new submissions are closed."
              : "This campaign is not live yet, so submissions are not open."}
          </p>
          <p className="mt-2 text-sm text-fg/60">
            {ended
              ? "Check Discover for live campaigns you can join instead."
              : "New campaigns appear on Discover once the brand has funded them and they go live."}
          </p>
          <Link
            href="/campaigns"
            className="mt-4 inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-ink"
          >
            Browse live campaigns
          </Link>
        </div>
      </div>
    );
  }

  const user = await getCurrentUser();
  let lastByPlatform: LastSubmission[] = [];
  // Approved clips per platform for this creator on this campaign
  // (P0 batch 2): only status='approved' counts — rejected clips do
  // NOT count toward the 15-per-platform limit.
  let approvedByPlatform: Partial<Record<Platform, number>> = {};
  if (user) {
    const subs = await getUserSubmissions(user.id);
    for (const s of subs) {
      if (s.campaign_id === campaign.id && s.status === "approved") {
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Submit a post</h1>
        <p className="mt-2 text-sm text-fg/60">
          {campaign.brand_name} — {campaign.title}
        </p>
      </div>
      <SubmitBundleForm
        campaign={campaign}
        lastByPlatform={lastByPlatform}
        isLoggedIn={Boolean(user)}
        approvedByPlatform={approvedByPlatform}
      />
    </div>
  );
}
