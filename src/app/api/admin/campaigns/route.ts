import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";

interface CampaignReviewBody {
  campaignId?: string;
  action?: "approve" | "reject";
}

/**
 * Owner-only campaign approval (mirrors api/admin/review).
 * Approve → status "live" AND is_funded = true: approval means the
 * owner confirmed the brand's $500+ budget actually reached him, and
 * Discover only lists campaigns that are BOTH funded and live.
 * Reject → status "rejected": the campaign is never shown anywhere.
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
  const profile = await getProfile(auth.user.id);
  if (!isOwner(profile)) {
    return NextResponse.json(
      { error: "Admin Review is owner-only." },
      { status: 403 }
    );
  }

  const body = (await request.json()) as CampaignReviewBody;
  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", body.campaignId ?? "")
    .single();
  if (campError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found." },
      { status: 404 }
    );
  }

  if (body.action === "approve") {
    // Approving starts the clock: the campaign runs from now until
    // its duration ends (no duration = until the budget ends) and
    // auto-ends when the duration finishes OR the budget hits 0.
    const startedAt = new Date();
    const durationDays = Number(
      (campaign as { duration_days?: number | null }).duration_days ?? 0
    );
    const endsAt =
      durationDays > 0
        ? new Date(startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000)
        : null;
    const patch: Record<string, unknown> = {
      status: "live",
      is_funded: true,
      started_at: startedAt.toISOString(),
    };
    if (endsAt) patch.ends_at = endsAt.toISOString();
    let { error } = await supabase
      .from("campaigns")
      .update(patch)
      .eq("id", campaign.id);
    if (error && /started_at|ends_at/i.test(error.message)) {
      // started_at / ends_at come from migration 0009, which may not
      // have been run yet — retry without them rather than failing.
      ({ error } = await supabase
        .from("campaigns")
        .update({ status: "live", is_funded: true })
        .eq("id", campaign.id));
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      message: "Campaign approved — now live on Discover.",
    });
  }

  if (body.action === "reject") {
    const { error } = await supabase
      .from("campaigns")
      .update({ status: "rejected" })
      .eq("id", campaign.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      message: "Campaign rejected — it will never be shown.",
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
