import { notFound } from "next/navigation";
import { getCampaign, getUserSubmissions } from "@/lib/data";
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

  const user = await getCurrentUser();
  let lastByPlatform: LastSubmission[] = [];
  let userPostCount = 0;
  if (user) {
    const subs = await getUserSubmissions(user.id);
    userPostCount = subs.filter((s) => s.campaign_id === campaign.id).length;
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
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-white">Submit a post</h1>
        <p className="mt-2 text-sm text-white/60">
          {campaign.brand_name} — {campaign.title}
        </p>
      </div>
      <SubmitBundleForm
        campaign={campaign}
        lastByPlatform={lastByPlatform}
        isLoggedIn={Boolean(user)}
        userPostCount={userPostCount}
      />
    </div>
  );
}
