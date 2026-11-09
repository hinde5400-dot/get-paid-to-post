import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { notifyPaymentProof } from "@/lib/notify";
import type { NotifyCampaign } from "@/lib/notify";

/**
 * Brand records the Transaction ID / hash of the USDT budget payment
 * for their own pending campaign. Only the campaign's brand owner
 * (or the admin) may do this, and only while the campaign is still
 * pending. The RLS trigger (migration 0013) enforces the same rule
 * at the database level: a brand may change nothing but the
 * payment_tx_id of their own pending campaign.
 */
export async function POST(
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

  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select(
      "id, user_id, status, title, budget_total, brand_name, platform_fee, rates, view_bonus_per_1k, min_views, max_payout_per_post"
    )
    .eq("id", params.id)
    .single();
  if (campError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found." },
      { status: 404 }
    );
  }
  const profile = await getProfile(auth.user.id);
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
      { error: "Only a pending campaign can record a payment." },
      { status: 400 }
    );
  }

  const body = (await request.json()) as { txId?: string };
  const txId = String(body.txId ?? "").trim();
  if (txId.length < 8 || txId.length > 128 || /\s/.test(txId)) {
    return NextResponse.json(
      { error: "Enter a valid Transaction ID / hash." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("campaigns")
    .update({ payment_tx_id: txId })
    .eq("id", params.id);
  if (error) {
    const msg = /payment_tx_id/i.test(error.message)
      ? "Payment system is not set up yet (migration 0013). Please try again later."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  // Notify the owner on Discord (Item 11b) — full campaign details
  // + TxID, fire-and-forget. A Discord failure never breaks the
  // brand's request; no webhook is configured yet, so this is a
  // silent no-op until Turn creates one.
  void notifyPaymentProof(campaign as unknown as NotifyCampaign, {
    txId,
  });
  return NextResponse.json({
    ok: true,
    message: "Payment submitted. The admin will verify it and your campaign will go LIVE in 1-2 hours.",
  });
}
