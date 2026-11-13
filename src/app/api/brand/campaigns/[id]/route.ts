import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Brand-owned cancel of a PENDING campaign (My Campaigns tab,
 * "Delete / Cancel"). Only the campaign's own brand may delete
 * it, and only while it is still pending AND unpaid: once a
 * payment (TxID) is on file the money path takes over — the brand
 * asks the admin for a refund instead (the refund button lives
 * on the payment page), so a paid campaign can never be deleted
 * out from under its payment.
 *
 * The delete cascades in the DB (submissions, brand_messages,
 * budget history and refund requests all reference campaigns
 * ON DELETE CASCADE) — a pending campaign has no submissions
 * anyway. No new status is invented: the row is gone.
 */
export async function DELETE(
  _request: Request,
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

  const rl = rateLimit(`brand-campaign-delete:${auth.user.id}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  const campaignId = typeof params.id === "string" ? params.id.trim() : "";
  if (!campaignId) {
    return NextResponse.json(
      { error: "campaignId is required." },
      { status: 400 }
    );
  }

  const { data: campaign, error: fetchError } = await supabase
    .from("campaigns")
    .select("id, user_id, status, title, payment_tx_id")
    .eq("id", campaignId)
    .single();
  if (fetchError || !campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (campaign.user_id !== auth.user.id) {
    return NextResponse.json(
      { error: "This campaign is not yours." },
      { status: 403 }
    );
  }
  if (campaign.status !== "pending") {
    return NextResponse.json(
      {
        error: `Only a pending campaign can be deleted (this one is ${String(campaign.status)}).`,
      },
      { status: 400 }
    );
  }
  if (typeof campaign.payment_tx_id === "string" && campaign.payment_tx_id.trim()) {
    return NextResponse.json(
      {
        error:
          "This campaign already has a payment on file — it cannot be deleted. Ask the admin about a refund instead.",
      },
      { status: 400 }
    );
  }

  const { error: deleteError } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("user_id", auth.user.id)
    .eq("status", "pending");
  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    message: `“${String(campaign.title ?? "Campaign")}” deleted.`,
  });
}
