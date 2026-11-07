import { getServerClient } from "./supabase/server";
import type { Campaign, Submission, Wallet, Withdrawal } from "./types";

function mapCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: String(row.id),
    brand_name: String(row.brand_name ?? ""),
    title: String(row.title ?? ""),
    rate_per_1m: Number(row.rate_per_1m ?? 0),
    budget_total: Number(row.budget_total ?? 0),
    budget_left: Number(row.budget_left ?? 0),
    spots_left: Number(row.spots_left ?? 0),
    spots_total: Number(row.spots_total ?? 0),
    category: String(row.category ?? "General"),
    platform: (row.platform as Campaign["platform"]) ?? "all",
    description: String(row.description ?? ""),
    rules: (row.rules as string | null) ?? null,
    base_pay: Number(row.base_pay ?? 10),
    view_bonus_per_1k: Number(row.view_bonus_per_1k ?? 0.75),
    views_tracked_days: Number(row.views_tracked_days ?? 14),
    max_posts: Number(row.max_posts ?? 7),
    earn_up_to: Number(row.earn_up_to ?? 300),
    is_funded: Boolean(row.is_funded),
    status: String(row.status ?? "draft"),
    created_at: String(row.created_at ?? ""),
  };
}

function mapSubmission(row: Record<string, unknown>): Submission {
  return {
    id: String(row.id),
    submission_code: String(row.submission_code ?? ""),
    user_id: String(row.user_id ?? ""),
    campaign_id: String(row.campaign_id ?? ""),
    campaign_title: (row.campaign_title as string | undefined) ?? undefined,
    bundle_id: String(row.bundle_id ?? ""),
    post_url: String(row.post_url ?? ""),
    platform: (row.platform as Submission["platform"]) ?? "tiktok",
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    status: (row.status as Submission["status"]) ?? "pending",
    earnings: Number(row.earnings ?? 0),
    hold_until: (row.hold_until as string | null) ?? null,
    how_made: String(row.how_made ?? ""),
    proof_screenshots: Array.isArray(row.proof_screenshots)
      ? (row.proof_screenshots as string[])
      : [],
    is_duplicate: Boolean(row.is_duplicate),
    created_at: String(row.created_at ?? ""),
  };
}

/**
 * Live funded campaigns from Supabase only. There are no sample or
 * fallback campaigns: a campaign appears here only after a brand has
 * funded $500+ and it is live. When none exist, this returns [] and the
 * site shows an honest "No funded campaigns yet" empty state.
 */
export async function getCampaigns(): Promise<Campaign[]> {
  const supabase = getServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("is_funded", true)
      .eq("status", "live")
      .order("created_at", { ascending: false });
    if (!error && data) {
      return (data as Record<string, unknown>[]).map(mapCampaign);
    }
  }
  return [];
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const supabase = getServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .single();
    if (!error && data) return mapCampaign(data as Record<string, unknown>);
  }
  return null;
}

/** A creator's submissions, newest first. Empty when Supabase is not set up. */
export async function getUserSubmissions(userId: string): Promise<Submission[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("submissions")
    .select("*, campaigns(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => {
    const s = mapSubmission(row);
    const camp = row.campaigns as { title?: string } | null;
    s.campaign_title = camp?.title;
    return s;
  });
}

/** All submissions, newest first — owner only. */
export async function getAllSubmissions(): Promise<Submission[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("submissions")
    .select("*, campaigns(title)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => {
    const s = mapSubmission(row);
    const camp = row.campaigns as { title?: string } | null;
    s.campaign_title = camp?.title;
    return s;
  });
}

export async function getWallet(userId: string): Promise<Wallet | null> {
  const supabase = getServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    user_id: String(row.user_id),
    available_balance: Number(row.available_balance ?? 0),
    pending_balance: Number(row.pending_balance ?? 0),
    withdrawn_total: Number(row.withdrawn_total ?? 0),
  };
}

export async function getWithdrawals(userId: string): Promise<Withdrawal[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    amount: Number(row.amount ?? 0),
    fee: Number(row.fee ?? 0),
    final_amount: Number(row.final_amount ?? 0),
    method: String(row.method ?? ""),
    details: String(row.details ?? ""),
    status: String(row.status ?? "pending"),
    created_at: String(row.created_at ?? ""),
  }));
}
