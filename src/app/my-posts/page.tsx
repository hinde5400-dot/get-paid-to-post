import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserSubmissions } from "@/lib/data";
import { getServerClient } from "@/lib/supabase/server";
import MyPostsList, { type CampaignHistoryRow } from "@/components/MyPostsList";

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
  const [submissions, pastCampaigns] = await Promise.all([
    getUserSubmissions(user.id),
    getUserCampaignHistory(user.id),
  ]);

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
