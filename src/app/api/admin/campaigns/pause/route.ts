import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Owner-only Pause / Start for a live campaign (admin tabs,
 * migration 0049: campaigns.is_paused).
 *
 * Pause: the campaign hides from Discover, its detail page 404s
 * (isCampaignLive returns false while paused) and /submit
 * refuses new clips — existing clips, earnings and budget are
 * untouched. Start: the same flag off, the campaign is live
 * again. Only a LIVE campaign can be paused — a pending one is
 * not live anyway, a settling one already ended.
 *
 * A missing is_paused column (migration 0049 not run yet) fails
 * the update — the error says so plainly instead of pretending
 * the pause worked.
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
  const rl = rateLimit(`admin-campaign-pause:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  let body: { campaignId?: string; paused?: boolean };
  try {
    body = (await request.json()) as { campaignId?: string; paused?: boolean };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
  const campaignId = typeof body.campaignId === "string" ? body.campaignId.trim() : "";
  if (!campaignId || typeof body.paused !== "boolean") {
    return NextResponse.json(
      { error: "campaignId and paused are required." },
      { status: 400 }
    );
  }

  const { data: campaign, error: fetchError } = await supabase
    .from("campaigns")
    .select("id, status, title")
    .eq("id", campaignId)
    .single();
  if (fetchError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found." },
      { status: 404 }
    );
  }
  if (campaign.status !== "live") {
    return NextResponse.json(
      {
        error: `Only a live campaign can be ${body.paused ? "paused" : "started"} (this one is ${String(campaign.status)}).`,
      },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("campaigns")
    .update({ is_paused: body.paused })
    .eq("id", campaignId)
    .eq("status", "live");
  if (updateError) {
    if (/is_paused/i.test(updateError.message)) {
      return NextResponse.json(
        {
          error:
            "Could not pause this campaign — run migration 0049 in Supabase first (it adds campaigns.is_paused). The campaign was NOT paused.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    message: body.paused
      ? `“${String(campaign.title ?? "Campaign")}” paused — hidden from Discover, no new submissions.`
      : `“${String(campaign.title ?? "Campaign")}” started — live again.`,
  });
}
