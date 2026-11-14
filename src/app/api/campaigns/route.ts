import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import {
  MAX_PAYOUT_DEFAULT,
  MAX_PAYOUT_MAX,
  MAX_PAYOUT_MIN,
} from "@/lib/constants";
import { platformFeeFor } from "@/lib/money";
import { DRIVE_FOLDER_ERROR, isDriveFolderUrl } from "@/lib/validate";
import { notifyCampaignCreated } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { isExpiredUnpaidPending } from "@/lib/data";
import type { Platform } from "@/lib/types";
import { CAMPAIGN_CATEGORIES, isCampaignCategory } from "@/lib/types";

const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;

/**
 * Brand campaign submission. Saves with status "pending" and
 * is_funded = false — nothing goes live until the owner approves it
 * in /admin (after the budget is funded). ONE rate per 1k views for
 * the whole campaign (item 2): the single `ratePer1k` applies to
 * every selected platform and is written into `rates` for all of
 * them; the legacy `rate_per_1m` / `view_bonus_per_1k` carry the
 * same rate as the fallback. A per-platform `rates` map is only
 * accepted when every platform's rate is the same value — a map
 * with differing rates is rejected. There is no minimum budget and
 * no minimum rate — any budget above $0 and any rate above $0 are
 * accepted. Platforms are stored in campaigns.platforms (migration
 * 0012) with the legacy platform column kept in sync: "all" when
 * all three are chosen, otherwise the first chosen. `min_views`
 * (site-wide floor of 1,000 views per clip — missing means 1,000,
 * below 1,000 is rejected) and the reference materials (step 4):
 * at least one reference link OR a Google Drive folder link
 * (`brief_url`) are brand-set. There is NO per-creator payout cap
 * (item 4): the `max_payout_per_creator` column is left unused,
 * never written. Wizard fields (migration 0050: goal, features,
 * types, brief_lines, link-in-bio, required sounds,
 * reference_links, visibility, show_on_discover, access_type) are
 * validated allow-list style and stored on the row; status stays
 * 'pending'.
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
  // Only brands create campaigns, and a blocked account creates
  // nothing — the block is supposed to stop all activity. (The
  // submissions and withdrawals routes already check this; this
  // route did not, so any logged-in creator — including a blocked
  // one — could land pending campaigns in the owner's queue.)
  const profile = await getProfile(auth.user.id);
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
  }
  // Only brand accounts (and the owner) create campaigns. A
  // missing profile row cannot prove a brand role, so it is
  // refused too — the message says how to fix it (sign up as a
  // brand).
  if (!profile || (profile.role !== "brand" && !profile.is_admin)) {
    return NextResponse.json(
      { error: "Only brand accounts can create campaigns — sign up as a brand first." },
      { status: 403 }
    );
  }
  // Best-effort rate limit (see lib/rate-limit.ts): 5 campaign
  // creates per minute per brand.
  const rl = rateLimit(`campaigns:${auth.user.id}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many campaigns — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  let body: {
    brandName?: string;
    logoUrl?: string | null;
    title?: string;
    category?: string;
    platform?: string;
    platforms?: string[];
    ratePer1k?: number;
    /** Per-platform rates (legacy): { tiktok: 1.5, youtube: 2 }.
     *  Only used when no single `ratePer1k` is sent — the form
     *  always sends one rate for all platforms (item 2). */
    rates?: Record<string, number>;
    /** Minimum views per clip, optional (P1-b). Missing = 1,000
     *  (the site-wide floor, migration 0028); below 1,000 is rejected. */
    minViews?: number | string;
    budgetTotal?: number;
    maxPayoutPerPost?: number | string;
    description?: string;
    requirements?: string;
    briefUrl?: string | null;
    thumbnailUrl?: string | null;
    durationDays?: number | null;
    /** Brand wizard (migration 0050). */
    goal?: string;
    features?: string[];
    types?: string[];
    /** Step 5 brief lines (one rule per line); falls back to `requirements`. */
    briefLines?: string[];
    requireLinkInBio?: boolean;
    requiredSoundTiktok?: string | null;
    requiredSoundInstagram?: string | null;
    referenceLinks?: string[];
    visibility?: string;
    showOnDiscover?: boolean;
    accessType?: string;
    minPayout?: number | string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request — send a valid JSON body." },
      { status: 400 }
    );
  }
  // Server-side validation mirrors the client form — never trust the
  // client alone. Every rejection carries the exact message the red
  // error popup shows.
  const brandName = String(body.brandName ?? "").trim();
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  // Step 5 brief: one rule per line. The wizard sends `briefLines`
  // (string[]); older clients send `requirements` text — either
  // way the lines are stored in `brief_lines` and joined into the
  // legacy `rules` column. At least one non-empty rule is required.
  const briefLines = Array.isArray(body.briefLines)
    ? body.briefLines.map((l) => String(l).trim()).filter(Boolean)
    : String(body.requirements ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
  const requirements = briefLines.join("\n");
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
      { error: "This field is required: Campaign Brief." },
      { status: 400 }
    );
  }
  if (!requirements) {
    return NextResponse.json(
      { error: "This field is required: Video requirements." },
      { status: 400 }
    );
  }
  // Text lengths: generous caps that stop absurd/accidental
  // values (a 10 MB description, a 1e9 min-views campaign) while
  // never binding a real brand.
  if (brandName.length > 100) {
    return NextResponse.json(
      { error: "Brand name must be 100 characters or less." },
      { status: 400 }
    );
  }
  if (title.length > 120) {
    return NextResponse.json(
      { error: "Campaign title must be 120 characters or less." },
      { status: 400 }
    );
  }
  if (description.length > 5000) {
    return NextResponse.json(
      { error: "Campaign Brief must be 5,000 characters or less." },
      { status: 400 }
    );
  }
  if (requirements.length > 5000) {
    return NextResponse.json(
      { error: "Video requirements must be 5,000 characters or less." },
      { status: 400 }
    );
  }
  // Category (P1-a): exactly one of the six — UGC, Clipping,
  // Lifestyle, Entertainment, Gaming, Technology. It is REQUIRED:
  // silently defaulting a missing category to UGC hid a form bug
  // and filed the campaign under the wrong category.
  const categoryRaw = String(body.category ?? "").trim();
  const category = categoryRaw;
  if (!category) {
    return NextResponse.json(
      { error: "This field is required: Category." },
      { status: 400 }
    );
  }
  if (!isCampaignCategory(category)) {
    return NextResponse.json(
      {
        error: `Error: Category must be one of ${CAMPAIGN_CATEGORIES.join(", ")}.`,
      },
      { status: 400 }
    );
  }
  // Any budget above $0 — there is no minimum budget. But the
  // budget is stored in cents: a sub-cent budget ($0.004) rounds
  // to $0.00 and the campaign then pays $0 forever, with no error
  // anywhere. Reject anything that rounds to $0. (No $1 floor:
  // Turn decided any budget above $0 is accepted.)
  const budgetTotalRaw = Number(body.budgetTotal ?? 0);
  if (!Number.isFinite(budgetTotalRaw) || budgetTotalRaw <= 0) {
    return NextResponse.json(
      { error: "Error: Budget must be more than $0" },
      { status: 400 }
    );
  }
  const budgetTotal = Math.round(budgetTotalRaw * 100) / 100;
  if (budgetTotal <= 0) {
    return NextResponse.json(
      { error: "Error: Budget is too small — after rounding it is $0.00." },
      { status: 400 }
    );
  }
  if (budgetTotal > 1_000_000) {
    return NextResponse.json(
      { error: "Error: Budget must be $1,000,000 or less." },
      { status: 400 }
    );
  }
  // Any rate above $0 — there is no minimum rate. Single rate
  // (item 2): ONE rate for the whole campaign. The form sends
  // `ratePer1k` and it applies to every selected platform. A
  // per-platform `rates` map is still accepted from older clients,
  // but only when no single rate is sent. (Platforms are parsed
  // below, so the rate check runs after that block.)
  const legacyRatePer1k = Number(body.ratePer1k ?? 0);
  const ratesInput =
    body.rates && typeof body.rates === "object" && !Array.isArray(body.rates)
      ? (body.rates as Record<string, unknown>)
      : null;
  if (
    !ratesInput &&
    (!Number.isFinite(legacyRatePer1k) || legacyRatePer1k <= 0)
  ) {
    return NextResponse.json(
      { error: "Error: Rate must be more than $0 per 1k views" },
      { status: 400 }
    );
  }
  // Max Payout Per Post: blank (missing / "" / null) means the
  // $100 default — the form starts blank now (friend's brand test,
  // 2026-11-11). A filled value must be $10–$200.
  const capRaw = body.maxPayoutPerPost;
  const cap =
    capRaw === null || capRaw === undefined || capRaw === ""
      ? MAX_PAYOUT_DEFAULT
      : Number(capRaw);
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
  // Single rate (item 2): the single `ratePer1k` — when sent —
  // applies to EVERY selected platform. A legacy per-platform
  // `rates` map is only accepted when every platform's rate is the
  // SAME value (one rate for the whole campaign) — a map with
  // differing rates is rejected outright, so no code path can ever
  // create a per-platform-rate campaign.
  const rates: Record<string, number> = {};
  for (const p of platforms) {
    const v =
      Number.isFinite(legacyRatePer1k) && legacyRatePer1k > 0
        ? legacyRatePer1k
        : ratesInput && ratesInput[p] !== undefined
          ? Number(ratesInput[p])
          : NaN;
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json(
        {
          error: `Error: Rate for ${p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "YouTube"} must be more than $0 per 1k views`,
        },
        { status: 400 }
      );
    }
    rates[p] = Math.round(v * 100) / 100;
    // A tiny rate ($0.001/1k) passes the > $0 check but rounds to
    // $0.00 — the campaign then pays $0 forever, with no error
    // anywhere. Reject anything that rounds to $0.
    if (rates[p] <= 0) {
      return NextResponse.json(
        {
          error: `Error: Rate for ${p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "YouTube"} is too small — after rounding it is $0.00 per 1k views.`,
        },
        { status: 400 }
      );
    }
    if (rates[p] > 1000) {
      return NextResponse.json(
        {
          error: `Error: Rate must be $1,000 or less per 1k views.`,
        },
        { status: 400 }
      );
    }
  }
  if (new Set(Object.values(rates)).size > 1) {
    return NextResponse.json(
      {
        error:
          "Error: One rate per 1,000 views applies to the whole campaign — set the same rate for every platform.",
      },
      { status: 400 }
    );
  }
  // The legacy single rate is the campaign's one rate, so old code
  // paths (rate_per_1m, view_bonus_per_1k) keep working.
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
  if (minViews > 1_000_000) {
    return NextResponse.json(
      { error: "Minimum views per clip must be 1,000,000 or less" },
      { status: 400 }
    );
  }
  // Required uploads (migration 0032, Turn's decision 2026-11-10):
  // Brand Logo and Thumbnail are file uploads — the form uploads
  // them to the public 'campaign-images' bucket and sends the
  // storage URLs here. External image links are no longer accepted.
  // The Google Drive link (item 6) is REQUIRED — and it must be a
  // Drive FOLDER link (drive.google.com/drive/folders/…): a single
  // file or video link is rejected (friend's brand test, 2026-11-11).
  // Brand wizard fields (migration 0050) — validated here, stored
  // in the insert below. Goal is exactly one of the four wizard
  // options when sent; features/types are allow-listed; visibility
  // is public/private; access is open/application.
  const GOALS = ["Brand awareness", "Drive sales", "UGC library", "Grow a community"] as const;
  const FEATURES = ["Campaigns", "Creators", "Payouts", "Analytics", "Submissions", "Discover", "Retainers", "Drafts"] as const;
  const TYPES = ["Clipping", "UGC (With Face)"] as const;
  const goal = String(body.goal ?? "").trim();
  if (goal && !(GOALS as readonly string[]).includes(goal)) {
    return NextResponse.json(
      { error: `Error: Goal must be one of ${GOALS.join(", ")}.` },
      { status: 400 }
    );
  }
  const features = Array.isArray(body.features)
    ? [...new Set(body.features.map((f) => String(f).trim()))].filter((f) =>
        (FEATURES as readonly string[]).includes(f)
      )
    : [];
  if (Array.isArray(body.features) && features.length !== body.features.length) {
    return NextResponse.json(
      { error: `Error: Features must be chosen from ${FEATURES.join(", ")}.` },
      { status: 400 }
    );
  }
  const types = Array.isArray(body.types)
    ? [...new Set(body.types.map((t) => String(t).trim()))].filter((t) =>
        (TYPES as readonly string[]).includes(t)
      )
    : [];
  if (types.length === 0) {
    return NextResponse.json(
      { error: "Select at least one campaign type — Clipping or UGC (With Face)." },
      { status: 400 }
    );
  }
  const visibility = String(body.visibility ?? "public").trim();
  if (!["public", "private"].includes(visibility)) {
    return NextResponse.json(
      { error: "Error: Visibility must be Public or Private." },
      { status: 400 }
    );
  }
  const accessType = String(body.accessType ?? "open").trim();
  if (!["open", "application"].includes(accessType)) {
    return NextResponse.json(
      { error: "Error: Access must be Open to public or Application only." },
      { status: 400 }
    );
  }
  const showOnDiscover = body.showOnDiscover !== false;
  const requireLinkInBio = body.requireLinkInBio === true;
  const soundTiktok = String(body.requiredSoundTiktok ?? "").trim();
  const soundInstagram = String(body.requiredSoundInstagram ?? "").trim();
  for (const [label, url] of [
    ["TikTok sound link", soundTiktok],
    ["Instagram Reel link", soundInstagram],
  ] as const) {
    if (url && !/^https?:\/\/.+\..+/.test(url)) {
      return NextResponse.json(
        { error: `Error: ${label} must be a valid link starting with http:// or https://.` },
        { status: 400 }
      );
    }
    if (url.length > 2000) {
      return NextResponse.json(
        { error: `Error: ${label} is too long.` },
        { status: 400 }
      );
    }
  }
  // Min payout per post (step 6 pricing): blank = the $1 column
  // default; a filled value must be $0–$200 and never above the
  // max payout per post.
  const minPayoutRaw = body.minPayout;
  const minPayout =
    minPayoutRaw === null || minPayoutRaw === undefined || minPayoutRaw === ""
      ? null
      : Number(minPayoutRaw);
  if (
    minPayout !== null &&
    (!Number.isFinite(minPayout) || minPayout < 0 || minPayout > MAX_PAYOUT_MAX)
  ) {
    return NextResponse.json(
      { error: `Error: Min payout must be between $0 and $${MAX_PAYOUT_MAX}` },
      { status: 400 }
    );
  }
  if (minPayout !== null && minPayout > cap) {
    return NextResponse.json(
      { error: "Error: Min payout cannot be more than Max payout per post." },
      { status: 400 }
    );
  }
  // Reference materials (step 4): at least one reference link OR
  // a Google Drive folder link. The old form required the Drive
  // folder alone; the wizard accepts Docs / Drive / Notion links
  // instead — a Drive folder, when given, must still be a folder
  // link (drive.google.com/drive/folders/…).
  const referenceLinks = Array.isArray(body.referenceLinks)
    ? [...new Set(body.referenceLinks.map((l) => String(l).trim()))].filter(Boolean)
    : [];
  if (referenceLinks.length > 10) {
    return NextResponse.json(
      { error: "Error: Add at most 10 reference links." },
      { status: 400 }
    );
  }
  for (const link of referenceLinks) {
    if (!/^https?:\/\/.+\..+/.test(link) || link.length > 2000) {
      return NextResponse.json(
        { error: "Error: Every reference link must be a valid link starting with http:// or https://." },
        { status: 400 }
      );
    }
  }
  const briefUrl = String(body.briefUrl ?? "").trim();
  const logoUrl = String(body.logoUrl ?? "").trim();
  const thumbnailUrl = String(body.thumbnailUrl ?? "").trim();
  const durationDays =
    body.durationDays === null || body.durationDays === undefined
      ? null
      : Number(body.durationDays);
  if (!briefUrl && referenceLinks.length === 0) {
    return NextResponse.json(
      { error: "Add at least one reference link, or a Google Drive folder link." },
      { status: 400 }
    );
  }
  if (briefUrl && !isDriveFolderUrl(briefUrl)) {
    return NextResponse.json(
      { error: `Error: ${DRIVE_FOLDER_ERROR}` },
      { status: 400 }
    );
  }
  if (!logoUrl) {
    return NextResponse.json(
      { error: "This field is required: Brand Logo." },
      { status: 400 }
    );
  }
  if (!thumbnailUrl) {
    return NextResponse.json(
      { error: "This field is required: Thumbnail." },
      { status: 400 }
    );
  }
  // The logo/thumbnail URLs must live in our own campaign-images
  // bucket — a brand cannot point its card at an arbitrary image.
  // Fail CLOSED when the Supabase URL is not configured: the old
  // code skipped the bucket check entirely in that case, so any
  // https:// image URL passed as the "required upload".
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
    /\/$/,
    ""
  );
  if (!supabaseUrl) {
    return NextResponse.json(
      {
        error:
          "Campaign images are not set up yet — the site owner needs to configure storage first.",
      },
      { status: 503 }
    );
  }
  const imagesPrefix = `${supabaseUrl}/storage/v1/object/public/campaign-images/`;
  for (const [label, url] of [
    ["Brand Logo", logoUrl],
    ["Thumbnail", thumbnailUrl],
  ] as const) {
    if (!/^https?:\/\/.+\..+/.test(url)) {
      return NextResponse.json(
        { error: `Error: ${label} must be a valid image URL.` },
        { status: 400 }
      );
    }
    if (imagesPrefix && !url.startsWith(imagesPrefix)) {
      return NextResponse.json(
        {
          error: `Error: ${label} must be uploaded through the form (campaign-images storage).`,
        },
        { status: 400 }
      );
    }
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
    // Single rate (item 2, migration 0025) — the same rate for
    // every selected platform; the legacy fields above carry the
    // same rate as the fallback.
    rates,
    // Minimum views per clip (site-wide floor of 1,000, migration
    // 0028 — a brand may set a higher threshold, never a lower
    // one). There is NO per-creator payout cap (item 4): the
    // `max_payout_per_creator` column is left unused and never
    // written here.
    min_views: minViews,
    // The per-post cap IS the "earn up to" figure shown on cards.
    max_payout_per_post: cap,
    views_tracked_days: 14,
    // No max_posts: the old hardcoded max_posts: 7 was dead (never
    // read anywhere) and stale next to the enforced 15-approved-
    // clips-per-platform rule.
    earn_up_to: cap,
    is_funded: false,
    status: "pending",
  };
  // Logo + thumbnail are REQUIRED uploads (validated above), so
  // they are always written — never conditionally.
  insertRow.logo_url = logoUrl;
  if (briefUrl) insertRow.brief_url = briefUrl;
  insertRow.thumbnail_url = thumbnailUrl;
  if (durationDays !== null) insertRow.duration_days = durationDays;
  if (minPayout !== null) insertRow.min_payout = minPayout;
  // Brand wizard (migration 0050): goal, features, types, brief
  // lines, link-in-bio, required sounds, reference links,
  // visibility / Discover / access. Status stays 'pending' and
  // is_funded stays false — nothing goes live until the owner
  // verifies funding in his wallet.
  if (goal) insertRow.goal = goal;
  insertRow.features = features;
  insertRow.types = types;
  insertRow.brief_lines = briefLines;
  insertRow.require_link_in_bio = requireLinkInBio;
  if (soundTiktok) insertRow.required_sound_tiktok = soundTiktok;
  if (soundInstagram) insertRow.required_sound_instagram = soundInstagram;
  insertRow.reference_links = referenceLinks;
  insertRow.visibility = visibility;
  insertRow.show_on_discover = showOnDiscover;
  insertRow.access_type = accessType;

  // Round-4 P2-B8: warn when the brand already has an unpaid
  // pending campaign — the response names it (id + title) so the
  // form and the dashboard can link it ("fund it first" instead
  // of stacking new pendings). Creation is NOT blocked.
  // "Unpaid" = pending with no TxID on file; an expired one is
  // skipped — it can no longer be funded, so it is not the one
  // to fund first. Looked up before the insert, so the new
  // campaign itself is never listed.
  let existingUnpaidPending: { id: string; title: string } | null = null;
  try {
    const { data: pendingRows } = await supabase
      .from("campaigns")
      .select("id, title, payment_tx_id, payment_tx_submitted_at, created_at, status")
      .eq("user_id", auth.user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);
    for (const row of (pendingRows ?? []) as Record<string, unknown>[]) {
      if (String(row.payment_tx_id ?? "").trim()) continue;
      if (
        isExpiredUnpaidPending(
          row as {
            status?: string | null;
            payment_tx_id?: string | null;
            payment_tx_submitted_at?: string | null;
            created_at?: string | null;
          }
        )
      ) {
        continue;
      }
      existingUnpaidPending = {
        id: String(row.id ?? ""),
        title: String(row.title ?? ""),
      };
      break;
    }
  } catch {
    existingUnpaidPending = null;
  }

  const { data, error } = await supabase
    .from("campaigns")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) {
    // No silent fallback: if the insert fails (e.g. a column is
    // missing), the brand sees the real error instead of a campaign
    // silently created without its owner, fee, rate or brief. All
    // migrations 0001–0034 are applied live, so a missing column
    // means something is genuinely wrong — never strip user_id or
    // platform_fee and retry.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Notify the owner on Discord (Item 11a) — full campaign details
  // + payment page link, fire-and-forget.
  void notifyCampaignCreated({
    id: (data as { id: string }).id,
    brand_name: brandName,
    title,
    budget_total: budgetTotal,
    platform_fee: platformFee,
    rates,
    view_bonus_per_1k: ratePer1k,
    min_views: minViews,
    max_payout_per_post: cap,
  });
  return NextResponse.json({
    ok: true,
    id: (data as { id: string }).id,
    existingUnpaidPending,
    message:
      "Campaign saved as pending. Now send your budget plus the 15% fee on the payment page — it goes live only after the admin verifies your payment.",
  });
}
