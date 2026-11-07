import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { BRAND_MIN_BUDGET } from "@/lib/constants";

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
    title?: string;
    ratePer1m?: number;
    budgetTotal?: number;
    category?: string;
    platform?: string;
    description?: string;
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
  const ratePer1m = Number(body.ratePer1m ?? 0);
  if (ratePer1m <= 0) {
    return NextResponse.json(
      { error: "Please set a rate per 1M views above $0." },
      { status: 400 }
    );
  }
  if (!String(body.brandName ?? "").trim() || !String(body.title ?? "").trim()) {
    return NextResponse.json(
      { error: "Brand name and campaign title are required." },
      { status: 400 }
    );
  }
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      brand_name: String(body.brandName).trim(),
      title: String(body.title).trim(),
      rate_per_1m: ratePer1m,
      budget_total: budgetTotal,
      budget_left: budgetTotal,
      spots_left: 0,
      spots_total: 0,
      category: String(body.category ?? "General"),
      platform: String(body.platform ?? "all"),
      description: String(body.description ?? "").trim(),
      base_pay: 10,
      view_bonus_per_1k: 0.75,
      views_tracked_days: 14,
      max_posts: 7,
      earn_up_to: 300,
      is_funded: false,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    id: (data as { id: string }).id,
    message:
      "Campaign saved as an unfunded draft. It goes live only after the budget is funded.",
  });
}
