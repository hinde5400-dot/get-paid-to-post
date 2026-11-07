import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { BRAND_MIN_BUDGET } from "@/lib/constants";

const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;

/**
 * Brand campaign submission. Saves with status "pending" and
 * is_funded = false — nothing goes live until the owner approves it
 * in /admin (after the $500+ budget is funded). "Rate per 1k views"
 * maps to view_bonus_per_1k, and rate_per_1m stays consistent at
 * rate-per-1k × 1000.
 */
export async function POST(request: Request) {
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }
  const body = (await request.json()) as {
    brandName?: string;
    logoUrl?: string | null;
    title?: string;
    platform?: string;
    ratePer1k?: number;
    budgetTotal?: number;
    description?: string;
    requirements?: string;
  };
  const budgetTotal = Number(body.budgetTotal ?? 0);
  if (budgetTotal < BRAND_MIN_BUDGET) {
    return NextResponse.json(
      {
        error: `Minimum budget to launch a campaign is $${BRAND_MIN_BUDGET}.`,
      },
      { status: 400 }
    );
  }
  const ratePer1k = Number(body.ratePer1k ?? 0);
  if (ratePer1k <= 0) {
    return NextResponse.json(
      { error: "Please set a rate per 1,000 views above $0." },
      { status: 400 }
    );
  }
  if (!PLATFORMS.includes((body.platform ?? "") as (typeof PLATFORMS)[number])) {
    return NextResponse.json(
      { error: "Platform must be TikTok, Instagram or YouTube." },
      { status: 400 }
    );
  }
  if (!String(body.brandName ?? "").trim() || !String(body.title ?? "").trim()) {
    return NextResponse.json(
      { error: "Brand name and campaign title are required." },
      { status: 400 }
    );
  }

  const insertRow: Record<string, unknown> = {
    brand_name: String(body.brandName).trim(),
    title: String(body.title).trim(),
    // Rate per 1k views drives the per-view bonus; rate per 1M views is
    // the same rate scaled up, so the two fields stay coherent.
    rate_per_1m: Math.round(ratePer1k * 1000 * 100) / 100,
    budget_total: budgetTotal,
    budget_left: budgetTotal,
    spots_left: 0,
    spots_total: 0,
    category: "General",
    platform: String(body.platform),
    description: String(body.description ?? "").trim(),
    rules: String(body.requirements ?? "").trim() || null,
    base_pay: 10,
    view_bonus_per_1k: ratePer1k,
    views_tracked_days: 14,
    max_posts: 7,
    earn_up_to: 300,
    is_funded: false,
    status: "pending",
  };
  const logoUrl = String(body.logoUrl ?? "").trim();
  if (logoUrl) insertRow.logo_url = logoUrl;

  let insertResult = await supabase
    .from("campaigns")
    .insert(insertRow)
    .select("id")
    .single();
  if (insertResult.error && /logo_url/i.test(insertResult.error.message)) {
    // The logo_url column comes from migration 0004, which may not have
    // been run yet. Retry without it instead of failing the submission.
    const { logo_url: _omit, ...withoutLogo } = insertRow;
    insertResult = await supabase
      .from("campaigns")
      .insert(withoutLogo)
      .select("id")
      .single();
  }
  const { data, error } = insertResult;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    id: (data as { id: string }).id,
    message:
      "Your campaign is under review. Admin will approve it soon.",
  });
}
