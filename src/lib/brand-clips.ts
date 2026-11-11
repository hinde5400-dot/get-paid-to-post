import { getServerClient } from "@/lib/supabase/server";
import { getCampaignStats } from "@/lib/data";
import type { Platform } from "@/lib/types";

/**
 * One submitted clip on a campaign, as its brand owner sees it:
 * link, platform, views, earnings and status. Creator identity is
 * deliberately NOT included — the brand sees what was posted and
 * what it earned, not who posted it.
 */
export interface BrandCampaignClip {
  id: string;
  post_url: string;
  platform: Platform;
  views: number;
  likes: number;
  comments: number;
  earnings: number;
  status: string;
  created_at: string;
}

export interface BrandCampaignClipsResult {
  clips: BrandCampaignClip[];
  /**
   * True when the campaign HAS submissions (per the stats RPC) but
   * this read returned none — i.e. the rows are RLS-blocked for
   * this caller, not genuinely absent. Submissions are readable
   * only by their creator and by the admin (migrations 0001/0002);
   * there is no brand-read policy and no SECURITY DEFINER
   * per-clip function yet, so until one lands a brand sees this
   * flag instead of a false "no clips" list. Callers must show an
   * honest "clip details unavailable" note when this is true,
   * never a fake empty state.
   */
  unavailable: boolean;
}

/**
 * Load a campaign's clips for its BRAND owner (Round-4 P1-B3).
 * Returns [] (and unavailable=false) when the campaign genuinely
 * has no submissions yet, and when the caller does not own the
 * campaign. Throws on a DB error, so callers show a load error,
 * never an empty list.
 */
export async function getBrandCampaignClips(
  campaignId: string,
  brandUserId: string
): Promise<BrandCampaignClipsResult> {
  const supabase = getServerClient();
  if (!supabase) {
    return { clips: [], unavailable: false };
  }
  // Ownership first: only the campaign's brand owner may list its
  // clips. The campaign read is public, so this check is cheap.
  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select("id, user_id")
    .eq("id", campaignId)
    .single();
  if (campError || !campaign) {
    throw new Error(campError?.message ?? "Campaign not found.");
  }
  if ((campaign as { user_id?: string | null }).user_id !== brandUserId) {
    return { clips: [], unavailable: false };
  }
  const { data, error } = await supabase
    .from("submissions")
    .select(
      "id, post_url, platform, views, likes, comments, earnings, status, created_at"
    )
    .eq("campaign_id", campaignId)
    .order("views", { ascending: false });
  if (error) throw new Error(error.message);
  const clips = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id ?? ""),
    post_url: String(row.post_url ?? ""),
    platform: (row.platform as Platform) ?? "tiktok",
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    earnings: Number(row.earnings ?? 0),
    status: String(row.status ?? "pending"),
    created_at: String(row.created_at ?? ""),
  }));
  // RLS check: the stats RPC (SECURITY DEFINER) sees every
  // submission, so when it reports clips but this read returned
  // none, the rows exist and are simply not readable by the
  // brand — report that instead of a false empty list.
  let unavailable = false;
  if (clips.length === 0) {
    try {
      const stats = await getCampaignStats(campaignId);
      unavailable = (stats?.total ?? 0) > 0;
    } catch {
      unavailable = false;
    }
  }
  return { clips, unavailable };
}
