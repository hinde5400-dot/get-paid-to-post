import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserSubmissions } from "@/lib/data";
import { getServerClient } from "@/lib/supabase/server";
import MyPostsList, { type CampaignHistoryRow } from "@/components/MyPostsList";

export const metadata: Metadata = {
  title: "My Posts",
  description:
    "Your submitted clips on Get Paid To Post — track review status, views and earnings for every post.",
};

/**
 * Participant history (migration 0027): the logged-in creator's own
 * rows only — RLS allows SELECT only where auth.uid() = user_id,
 * and the query filters to this user as well. Returns [] when the
 * table doesn't exist yet (migration not applied) or on any error,
 * so the page still renders with the honest empty state.
 */
async function getUserCampaignHistory(
  userId: string
): Promise<CampaignHistoryRow[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("campaign_history")
    .select(
      "id, campaign_id, campaign_title, brand_name, platforms, joined_at, clips_submitted, clips_approved, total_views, total_earned, status"
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    campaign_id: (row.campaign_id as string | null) ?? null,
    campaign_title: (row.campaign_title as string | null) ?? null,
    brand_name: (row.brand_name as string | null) ?? null,
    platforms: Array.isArray(row.platforms)
      ? (row.platforms as string[])
      : null,
    joined_at: (row.joined_at as string | null) ?? null,
    clips_submitted: Number(row.clips_submitted ?? 0),
    clips_approved: Number(row.clips_approved ?? 0),
    total_views: Number(row.total_views ?? 0),
    total_earned: Number(row.total_earned ?? 0),
    status: String(row.status ?? "completed"),
  }));
}

export default async function MyPostsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Forms #26: a failed load renders an honest error state, never
  // the empty "no posts" state. getUserSubmissions THROWS on DB
  // error; the campaign-history lookup is best-effort and still
  // returns [] on failure, so it never triggers the error state.
  let submissions: Awaited<ReturnType<typeof getUserSubmissions>> = [];
  let loadError = false;
  try {
    submissions = await getUserSubmissions(user.id);
    // Round-5 P1: approval-time facts (migration 0043 —
    // budget_capped + approval_views). getUserSubmissions lives in
    // lib/data.ts (another workstream's file), and its mapper does
    // not carry these columns yet, so they are merged here from a
    // narrow second read of this creator's own rows. Best-effort:
    // before migration 0043 is applied live the select fails on
    // the unknown columns and the merge is skipped — My Posts
    // then renders the plain breakdown (budget_capped falls back
    // to false), never the false capped claim.
    try {
      const supabase = getServerClient();
      if (supabase && submissions.length > 0) {
        const { data: facts, error: factsError } = await supabase
          .from("submissions")
          .select("id, budget_capped, approval_views")
          .eq("user_id", user.id)
          .in(
            "id",
            submissions.map((s) => s.id)
          );
        if (!factsError && facts) {
          const byId = new Map(
            (facts as Record<string, unknown>[]).map((row) => [
              String(row.id ?? ""),
              {
                budget_capped: Boolean(row.budget_capped ?? false),
                approval_views:
                  row.approval_views == null
                    ? null
                    : Number(row.approval_views),
              },
            ])
          );
          submissions = submissions.map((s) => ({
            ...s,
            ...(byId.get(s.id) ?? {
              budget_capped: false,
              approval_views: null,
            }),
          }));
        }
      }
    } catch {
      // Pre-migration 0043 (unknown columns) or a transient DB
      // error — rows render without the stored facts.
    }
  } catch {
    loadError = true;
  }
  const pastCampaigns = await getUserCampaignHistory(user.id);
  if (loadError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">My Posts</h1>
          <p className="mt-2 text-sm text-fg/60">
            Every clip you submitted, with views, likes and earnings. Metrics
            update every 3 hours.
          </p>
        </div>
        <div className="rounded-3xl border border-red-500/40 bg-card p-8 text-center">
          <p className="text-lg font-black text-fg">
            Couldn&apos;t load your posts
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            Your posts could not be loaded — please try again. Your data
            is safe; this is a loading problem, not an empty list.
          </p>
          <a
            href="/my-posts"
            className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">My Posts</h1>
        <p className="mt-2 text-sm text-fg/60">
          Every clip you submitted, with views, likes and earnings. Metrics
          update every 3 hours.
        </p>
      </div>
      <MyPostsList submissions={submissions} pastCampaigns={pastCampaigns} />
    </div>
  );
}
