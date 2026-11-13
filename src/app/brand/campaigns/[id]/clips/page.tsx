import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getModeContext } from "@/lib/mode";
import { getCampaign } from "@/lib/data";
import { getServerClient } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/money";
import type { Submission } from "@/lib/types";

export const metadata: Metadata = {
  title: "Campaign clips",
  description: "Clips creators submitted for your campaign.",
};

/**
 * Brand's own clips view (My Campaigns → View Clips): every clip
 * creators submitted for this campaign, with platform, status,
 * views and a link to the post. The brand reads these through
 * the RLS policy from migration 0042 ("submissions brand read
 * own campaign") — other brands and creators see nothing here.
 * Creator emails are not shown (the brand cannot read other
 * users' rows); the clip link is the identity that matters.
 */
export default async function BrandClipsPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { brandCapable, isAdmin } = await getModeContext();
  if (!brandCapable) redirect("/campaigns");

  const campaign = await getCampaign(params.id);
  if (!campaign) redirect("/brand/campaigns");
  // Only the owning brand (or the owner) may see these clips.
  if (campaign.user_id !== user.id && !isAdmin) {
    redirect("/brand/campaigns");
  }

  let clips: Submission[] = [];
  let loadError = false;
  try {
    const supabase = getServerClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase
      .from("submissions")
      .select(
        "id, submission_code, user_id, campaign_id, platform, post_url, views, likes, comments, status, earnings, rejection_reason, created_at"
      )
      .eq("campaign_id", campaign.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    clips = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id ?? ""),
      submission_code: String(row.submission_code ?? ""),
      user_id: String(row.user_id ?? ""),
      campaign_id: String(row.campaign_id ?? ""),
      bundle_id: "",
      post_url: String(row.post_url ?? ""),
      platform: row.platform as Submission["platform"],
      views: Number(row.views ?? 0),
      likes: Number(row.likes ?? 0),
      comments: Number(row.comments ?? 0),
      status: row.status as Submission["status"],
      earnings: Number(row.earnings ?? 0),
      rejection_reason: (row.rejection_reason as string | null) ?? null,
      hold_until: null,
      how_made: "",
      proof_screenshots: [],
      is_duplicate: false,
      created_at: String(row.created_at ?? ""),
    }));
  } catch {
    loadError = true;
  }

  const approved = clips.filter((s) => s.status === "approved").length;
  const pending = clips.filter((s) => s.status === "pending").length;
  const rejected = clips.filter((s) => s.status === "rejected").length;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/brand/campaigns"
          className="text-sm font-bold text-lime hover:underline"
        >
          ← My Campaigns
        </Link>
        <h1 className="mt-2 font-display text-3xl font-black uppercase tracking-tight text-fg">
          Clips — {campaign.title}
        </h1>
        <p className="mt-1 text-sm text-fg/60">
          {clips.length} clip{clips.length === 1 ? "" : "s"} · {approved}{" "}
          approved · {pending} pending · {rejected} rejected
        </p>
      </div>

      {loadError ? (
        <div className="mx-auto max-w-lg rounded-3xl border border-red-500/40 bg-card p-8 text-center">
          <h2 className="font-display text-2xl font-black uppercase tracking-tight text-fg">
            Couldn&apos;t load the clips
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-fg/60">
            The clips could not be loaded — please try again. Your data
            is safe; this is a loading problem, not an empty list.
          </p>
          <Link
            href={`/brand/campaigns/${campaign.id}/clips`}
            className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Try again
          </Link>
        </div>
      ) : clips.length === 0 ? (
        <div className="rounded-2xl border border-fg/10 bg-card p-8 text-center">
          <p className="text-4xl" aria-hidden>
            🎬
          </p>
          <h3 className="mt-3 text-lg font-black text-fg">
            No clips submitted yet
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            Creators haven&apos;t posted any clips for this campaign yet.
            Clips show up here as soon as they are submitted.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {clips.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-fg/10 bg-card p-4"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime/15 font-display text-lg font-black text-lime">
                {s.platform === "tiktok"
                  ? "♪"
                  : s.platform === "instagram"
                    ? "◎"
                    : "▶"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold capitalize text-fg">{s.platform}</p>
                <p className="text-xs text-fg/50">
                  {s.views.toLocaleString()} views ·{" "}
                  {s.likes.toLocaleString()} likes ·{" "}
                  {s.comments.toLocaleString()} comments
                  {s.status === "approved" &&
                    ` · Earned ${formatUSD(s.earnings)}`}
                </p>
                {s.status === "rejected" && s.rejection_reason && (
                  <p className="mt-1 text-xs text-red-300">
                    Rejected: {s.rejection_reason}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-fg/40">
                  Submitted{" "}
                  {new Date(s.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                  s.status === "approved"
                    ? "bg-lime/15 text-lime"
                    : s.status === "rejected"
                      ? "bg-red-500/15 text-red-300"
                      : "bg-yellow-500/15 text-yellow-300"
                }`}
              >
                {s.status === "approved"
                  ? "Approved"
                  : s.status === "rejected"
                    ? "Rejected"
                    : "Pending"}
              </span>
              <a
                href={s.post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-fg/20 px-4 py-2 text-xs font-bold text-fg transition hover:border-lime hover:text-lime"
              >
                Open clip ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
