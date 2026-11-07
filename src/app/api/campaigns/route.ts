import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import {
  MAX_PAYOUT_DEFAULT,
  MAX_PAYOUT_MAX,
  MAX_PAYOUT_MIN,
  MIN_RATE_PER_1K,
} from "@/lib/constants";
import type { Platform } from "@/lib/types";

const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;

/**
 * Brand campaign submission. Saves with status "pending" and
 * is_funded = false — nothing goes live until the owner approves it
 * in /admin (after the budget is funded). "Rate per 1k views"
 * maps to view_bonus_per_1k, and rate_per_1m stays consistent at
 * rate-per-1k × 1000. There is no minimum budget — any amount above
 * $0 is accepted. Platforms are stored in campaigns.platforms
 * (migration 0012) with the legacy platform column kept in sync:
 * "all" when all three are chosen, otherwise the first chosen.
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
    platforms?: string[];
    ratePer1k?: number;
    budgetTotal?: number;
    maxPayoutPerPost?: number;
    description?: string;
    requirements?: string;
    briefUrl?: string | null;
    thumbnailUrl?: string | null;
    durationDays?: number | null;
  };
  // Server-side validation mirrors the client form — never trust the
  // client alone. Every rejection carries the exact message the red
  // error popup shows.
  const brandName = String(body.brandName ?? "").trim();
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const requirements = String(body.requirements ?? "").trim();
  if (!brandName) {
    return NextResponse.json(
      { error: "This field is required: Brand name." },
      { status: 400 }
    );
  }
  if (!title) {
    return NextResponse.json(
      { error: "This field is required: Campaign title." },
      { status: 400 }
    );
  }
  if (!description) {
    return NextResponse.json(
      { error: "This field is required: Campaign description." },
      { status: 400 }
    );
  }
  if (!requirements) {
    return NextResponse.json(
      { error: "This field is required: Video requirements." },
      { status: 400 }
    );
  }
  // Any budget above $0 — there is no minimum budget.
  const budgetTotal = Number(body.budgetTotal ?? 0);
  if (!Number.isFinite(budgetTotal) || budgetTotal <= 0) {
    return NextResponse.json(
      { error: "Error: Budget must be more than $0" },
      { status: 400 }
    );
  }
  const ratePer1k = Number(body.ratePer1k ?? 0);
  if (ratePer1k < MIN_RATE_PER_1K) {
    return NextResponse.json(
      {
        error: `Error: Rate cannot be less than $${MIN_RATE_PER_1K} per 1k views`,
      },
      { status: 400 }
    );
  }
  const cap = Number(body.maxPayoutPerPost ?? MAX_PAYOUT_DEFAULT);
  if (!Number.isFinite(cap) || cap < MAX_PAYOUT_MIN || cap > MAX_PAYOUT_MAX) {
    return NextResponse.json(
      {
        error: `Error: Max payout per post must be between $${MAX_PAYOUT_MIN} and $${MAX_PAYOUT_MAX}`,
      },
      { status: 400 }
    );
  }
  // Platforms: the form sends a platforms array (1–3 of TikTok /
  // Instagram / YouTube); a single legacy platform value is also
  // accepted. At least one platform is required.
  let platforms: Platform[] = [];
  if (Array.isArray(body.platforms)) {
    platforms = [
      ...new Set(
        body.platforms
          .map((p) => String(p))
          .filter((p): p is Platform =>
            (PLATFORMS as readonly string[]).includes(p)
          )
      ),
    ];
  } else if (
    typeof body.platform === "string" &&
    (PLATFORMS as readonly string[]).includes(body.platform)
  ) {
    platforms = [body.platform as Platform];
  }
  if (platforms.length === 0) {
    return NextResponse.json(
      { error: "Select at least one platform" },
      { status: 400 }
    );
  }
  // Optional new fields (migration 0009): a Drive brief link, a
  // thumbnail image link, and the campaign duration in days (null =
  // runs until the budget ends).
  const briefUrl = String(body.briefUrl ?? "").trim();
  const thumbnailUrl = String(body.thumbnailUrl ?? "").trim();
  const durationDays =
    body.durationDays === null || body.durationDays === undefined
      ? null
      : Number(body.durationDays);
  if (briefUrl && !/^https?:\/\/.+\..+/.test(briefUrl)) {
    return NextResponse.json(
      {
        error:
          "Error: Campaign Brief link must be a valid URL (starts with http:// or https://).",
      },
      { status: 400 }
    );
  }
  if (thumbnailUrl && !/^https?:\/\/.+\..+/.test(thumbnailUrl)) {
    return NextResponse.json(
      {
        error:
          "Error: Thumbnail Image Link must be a valid URL (starts with http:// or https://).",
      },
      { status: 400 }
    );
  }
  if (durationDays !== null && ![7, 14, 30].includes(durationDays)) {
    return NextResponse.json(
      { error: "Campaign Duration must be 7, 14 or 30 days, or until the budget ends." },
      { status: 400 }
    );
  }

  const insertRow: Record<string, unknown> = {
    brand_name: brandName,
    title,
    // Rate per 1k views drives the per-view bonus; rate per 1M views is
    // the same rate scaled up, so the two fields stay coherent.
    rate_per_1m: Math.round(ratePer1k * 1000 * 100) / 100,
    budget_total: budgetTotal,
    budget_left: budgetTotal,
    spots_left: 0,
    spots_total: 0,
    category: "General",
    // Legacy column: "all" when all three platforms are chosen,
    // otherwise the first chosen platform. The platforms array is
    // the source of truth (migration 0012).
    platform: platforms.length === 3 ? "all" : platforms[0],
    platforms,
    description,
    rules: requirements || null,
    base_pay: 10,
    view_bonus_per_1k: ratePer1k,
    // The per-post cap IS the "earn up to" figure shown on cards.
    max_payout_per_post: cap,
    views_tracked_days: 14,
    max_posts: 7,
    earn_up_to: cap,
    is_funded: false,
    status: "pending",
  };
  const logoUrl = String(body.logoUrl ?? "").trim();
  if (logoUrl) insertRow.logo_url = logoUrl;
  if (briefUrl) insertRow.brief_url = briefUrl;
  if (thumbnailUrl) insertRow.thumbnail_url = thumbnailUrl;
  if (durationDays !== null) insertRow.duration_days = durationDays;

  let insertResult = await supabase
    .from("campaigns")
    .insert(insertRow)
    .select("id")
    .single();
  if (insertResult.error) {
    // New columns come from migrations (0004 logo_url, 0007
    // max_payout_per_post, 0009 brief/thumbnail/duration, 0012
    // platforms) which may not have been run yet. Drop the column the
    // database complains about and retry once, instead of failing the
    // submission.
    const msg = insertResult.error.message;
    const retryRow: Record<string, unknown> = { ...insertRow };
    let stripped = false;
    for (const col of [
      "logo_url",
      "max_payout_per_post",
      "brief_url",
      "thumbnail_url",
      "duration_days",
      "platforms",
    ] as const) {
      if (new RegExp(col, "i").test(msg)) {
        delete retryRow[col];
        stripped = true;
      }
    }
    if (stripped) {
      insertResult = await supabase
        .from("campaigns")
        .insert(retryRow)
        .select("id")
        .single();
    }
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
