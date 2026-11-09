import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import {
  MAX_PAYOUT_DEFAULT,
  MAX_PAYOUT_MAX,
  MAX_PAYOUT_MIN,
} from "@/lib/constants";
import { platformFeeFor } from "@/lib/money";
import type { Platform } from "@/lib/types";
import { CAMPAIGN_CATEGORIES, isCampaignCategory } from "@/lib/types";

const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;

/**
 * Brand campaign submission. Saves with status "pending" and
 * is_funded = false — nothing goes live until the owner approves it
 * in /admin (after the budget is funded). Per-platform rates (P1-b)
 * map to `rates` (rate per 1k views per platform); the legacy
 * `rate_per_1m` / `view_bonus_per_1k` carry the first selected
 * platform's rate as the fallback. There is no minimum budget and no
 * minimum rate — any budget above $0 and any rate above $0 are
 * accepted. Platforms are stored in campaigns.platforms
 * (migration 0012) with the legacy platform column kept in sync:
 * "all" when all three are chosen, otherwise the first chosen.
 * `min_views` (site-wide floor of 1,000 views per clip — missing
 * means 1,000, below 1,000 is rejected) and `max_payout_per_creator`
 * (null = no cap) are brand-set limits.
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
    category?: string;
    platform?: string;
    platforms?: string[];
    ratePer1k?: number;
    /** Per-platform rates (P1-b): { tiktok: 1.5, youtube: 2 } — rate
     *  per 1,000 views for each selected platform. */
    rates?: Record<string, number>;
    /** Minimum views per clip, optional (P1-b). Missing = 1,000
     *  (the site-wide floor, migration 0028); below 1,000 is rejected. */
    minViews?: number | string;
    /** Max payout per creator in $, optional (P1-b). Missing/null = no cap. */
    maxPayoutPerCreator?: number | string | null;
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
  // Category (P1-a): exactly one of the six — UGC, Clipping,
  // Lifestyle, Entertainment, Gaming, Technology. Missing means the
  // old form, so default to UGC; anything else is rejected.
  const categoryRaw = String(body.category ?? "").trim();
  const category = categoryRaw === "" ? "UGC" : categoryRaw;
  if (!isCampaignCategory(category)) {
    return NextResponse.json(
      {
        error: `Error: Category must be one of ${CAMPAIGN_CATEGORIES.join(", ")}.`,
      },
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
  // Any rate above $0 — there is no minimum rate. Per-platform
  // rates (P1-b): every selected platform must have its own rate
  // above $0. The form sends `rates`; the legacy single `ratePer1k`
  // is still accepted and applies to every selected platform.
  // (Platforms are parsed below, so the per-platform check runs
  // after that block — see the `rates` validation there.)
  const legacyRatePer1k = Number(body.ratePer1k ?? 0);
  const ratesInput =
    body.rates && typeof body.rates === "object" && !Array.isArray(body.rates)
      ? (body.rates as Record<string, unknown>)
      : null;
  if (!ratesInput && (!Number.isFinite(legacyRatePer1k) || legacyRatePer1k <= 0)) {
    return NextResponse.json(
      { error: "Error: Rate must be more than $0 per 1k views" },
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
  // Per-platform rates (P1-b): every selected platform needs a rate
  // above $0. With `rates`, each selected platform must carry its
  // own; without it, the legacy single rate applies to all of them.
  const rates: Record<string, number> = {};
  for (const p of platforms) {
    const v =
      ratesInput && ratesInput[p] !== undefined
        ? Number(ratesInput[p])
        : legacyRatePer1k;
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json(
        {
          error: `Error: Rate for ${p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "YouTube"} must be more than $0 per 1k views`,
        },
        { status: 400 }
      );
    }
    rates[p] = Math.round(v * 100) / 100;
  }
  // The legacy single rate is the FIRST selected platform's rate,
  // so old code paths (rate_per_1m, view_bonus_per_1k) keep working.
  const ratePer1k = rates[platforms[0]];
  // Minimum views per clip (P1-b, migration 0028): site-wide floor
  // of 1,000 — missing means 1,000, and anything below 1,000 is
  // rejected. A brand may set a higher threshold, never a lower one.
  const minViewsRaw = body.minViews;
  const minViews =
    minViewsRaw === null || minViewsRaw === undefined || minViewsRaw === ""
      ? 1000
      : Math.floor(Number(minViewsRaw));
  if (!Number.isFinite(minViews) || minViews < 1000) {
    return NextResponse.json(
      { error: "Minimum views per clip must be at least 1,000" },
      { status: 400 }
    );
  }
  // Per-creator $ cap (P1-b): optional, null = no cap (the default).
  const maxPayoutPerCreatorRaw = body.maxPayoutPerCreator;
  const maxPayoutPerCreator =
    maxPayoutPerCreatorRaw === null ||
    maxPayoutPerCreatorRaw === undefined ||
    maxPayoutPerCreatorRaw === ""
      ? null
      : Number(maxPayoutPerCreatorRaw);
  if (
    maxPayoutPerCreator !== null &&
    (!Number.isFinite(maxPayoutPerCreator) || maxPayoutPerCreator <= 0)
  ) {
    return NextResponse.json(
      { error: "Error: Maximum payout per creator must be more than $0" },
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

  // Platform fee: 15% FLAT, charged ON TOP of the budget. The
  // brand sends budget_total + fee (the payment page shows the
  // split); budget_left is the FULL budget_total — the creators
  // pool the payouts draw from. There is no hidden internal
  // budget, and the admin must not edit the budget down.
  const platformFee = platformFeeFor(budgetTotal);
  const insertRow: Record<string, unknown> = {
    brand_name: brandName,
    title,
    // The campaign owner (migration 0013) — the payment page and
    // the payment Transaction ID update both check this.
    user_id: auth.user.id,
    // Rate per 1k views drives the per-view bonus; rate per 1M views is
    // the same rate scaled up, so the two fields stay coherent.
    rate_per_1m: Math.round(ratePer1k * 1000 * 100) / 100,
    budget_total: budgetTotal,
    budget_left: budgetTotal,
    platform_fee: platformFee,
    spots_left: 0,
    spots_total: 0,
    category,
    // Legacy column: "all" when all three platforms are chosen,
    // otherwise the first chosen platform. The platforms array is
    // the source of truth (migration 0012).
    platform: platforms.length === 3 ? "all" : platforms[0],
    platforms,
    description,
    rules: requirements || null,
    view_bonus_per_1k: ratePer1k,
    // Per-platform rates (P1-b, migration 0025) — the source of
    // truth for review/earnings; the legacy fields above carry the
    // first platform's rate as the fallback.
    rates,
    // Minimum views per clip (site-wide floor of 1,000, migration
    // 0028 — a brand may set a higher threshold, never a lower one)
    // and per-creator $ cap (null = no cap) — the cap is brand-set
    // and optional.
    min_views: minViews,
    max_payout_per_creator: maxPayoutPerCreator,
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
    // platforms, 0013 user_id, 0021 platform_fee) which may not have
    // been run yet. Drop the column the database complains about
    // and retry once, instead of failing the submission.
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
      "platform_fee",
      "user_id",
      "rates",
      "min_views",
      "max_payout_per_creator",
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
