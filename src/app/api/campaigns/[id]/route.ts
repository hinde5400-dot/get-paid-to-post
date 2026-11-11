import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { isDriveFolderUrl, DRIVE_FOLDER_ERROR } from "@/lib/validate";
import { rateLimit } from "@/lib/rate-limit";
import type { Platform } from "@/lib/types";

/**
 * PATCH — edit a PENDING campaign's brief / requirements / rate /
 * Drive link (Round-4 P1-B4). Before this route existed the only
 * fix for a typo'd rate or brief was reject → recreate → repay;
 * now the brand (or the admin) can correct it in place while the
 * campaign is still pending.
 *
 * Only the campaign's brand owner (or the owner/admin) may edit,
 * and only while status is "pending" — a live campaign's rate is
 * the money term creators already signed up to, so it is frozen
 * once live. Budget is NOT editable here: budget edits go through
 * the admin budget-edit route, which records the history the
 * approve gate depends on. The platform fee is budget-derived, so
 * it never changes here either.
 *
 * All fields are optional (fix one typo, leave the rest), but any
 * field sent is validated with the same rules as campaign creation:
 * brief / requirements non-empty, ≤5,000 chars; rate > $0, ≤ $1,000
 * per 1k views, rounding to more than $0; Drive link must be a
 * Drive FOLDER link. A changed rate is written to every rate field
 * (single rate for the whole campaign) so legacy readers stay in
 * sync.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
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
  const profile = await getProfile(auth.user.id);
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
  }
  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select(
      "id, user_id, status, title, platforms, platform, description, rules, brief_url, view_bonus_per_1k"
    )
    .eq("id", params.id)
    .single();
  if (campError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found." },
      { status: 404 }
    );
  }
  const ownsIt =
    (campaign as { user_id?: string | null }).user_id === auth.user.id;
  if (!ownsIt && !isOwner(profile)) {
    return NextResponse.json(
      { error: "Campaign not found." },
      { status: 404 }
    );
  }
  if ((campaign as { status?: string }).status !== "pending") {
    return NextResponse.json(
      {
        error:
          "Only a pending campaign can be edited — this one has already been decided.",
      },
      { status: 400 }
    );
  }
  const rl = rateLimit(`campaign-edit:${auth.user.id}:${params.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many edits — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  let body: {
    description?: string;
    requirements?: string;
    ratePer1k?: number;
    briefUrl?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request — send a valid JSON body." },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {};
  if (body.description !== undefined) {
    const description = String(body.description ?? "").trim();
    if (!description) {
      return NextResponse.json(
        { error: "This field is required: Campaign Brief." },
        { status: 400 }
      );
    }
    if (description.length > 5000) {
      return NextResponse.json(
        { error: "Campaign Brief must be 5,000 characters or less." },
        { status: 400 }
      );
    }
    patch.description = description;
  }
  if (body.requirements !== undefined) {
    const requirements = String(body.requirements ?? "").trim();
    if (!requirements) {
      return NextResponse.json(
        { error: "This field is required: Video requirements." },
        { status: 400 }
      );
    }
    if (requirements.length > 5000) {
      return NextResponse.json(
        { error: "Video requirements must be 5,000 characters or less." },
        { status: 400 }
      );
    }
    patch.rules = requirements;
  }
  if (body.ratePer1k !== undefined) {
    const rateRaw = Number(body.ratePer1k);
    if (!Number.isFinite(rateRaw) || rateRaw <= 0) {
      return NextResponse.json(
        { error: "Error: Rate must be more than $0 per 1k views" },
        { status: 400 }
      );
    }
    const rate = Math.round(rateRaw * 100) / 100;
    if (rate <= 0) {
      return NextResponse.json(
        {
          error:
            "Error: Rate is too small — after rounding it is $0.00 per 1k views.",
        },
        { status: 400 }
      );
    }
    if (rate > 1000) {
      return NextResponse.json(
        { error: "Error: Rate must be $1,000 or less per 1k views." },
        { status: 400 }
      );
    }
    // Single rate for the whole campaign: every rate field carries
    // the same value, as campaign creation does.
    const platforms = (
      Array.isArray(
        (campaign as { platforms?: unknown }).platforms
      )
        ? (campaign as { platforms: Platform[] }).platforms
        : []
    ).filter((p): p is Platform =>
      ["tiktok", "instagram", "youtube"].includes(p)
    );
    const rates: Record<string, number> = {};
    for (const p of platforms.length > 0 ? platforms : (["tiktok"] as Platform[])) {
      rates[p] = rate;
    }
    patch.view_bonus_per_1k = rate;
    patch.rate_per_1m = Math.round(rate * 1000 * 100) / 100;
    patch.rates = rates;
  }
  if (body.briefUrl !== undefined) {
    const briefUrl = String(body.briefUrl ?? "").trim();
    if (!briefUrl) {
      return NextResponse.json(
        { error: "This field is required: Google Drive Link." },
        { status: 400 }
      );
    }
    if (!isDriveFolderUrl(briefUrl)) {
      return NextResponse.json(
        { error: `Error: ${DRIVE_FOLDER_ERROR}` },
        { status: 400 }
      );
    }
    patch.brief_url = briefUrl;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nothing to change — send a brief, requirements, rate or Drive link." },
      { status: 400 }
    );
  }

  // Status-guarded flip: a concurrent approve/reject wins, and this
  // edit then 409s instead of silently changing a decided campaign.
  const { data: updated, error } = await supabase
    .from("campaigns")
    .update(patch)
    .eq("id", params.id)
    .eq("status", "pending")
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      {
        error:
          "This campaign was already decided — reload to see its current status.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({
    ok: true,
    message: "Campaign updated.",
  });
}
