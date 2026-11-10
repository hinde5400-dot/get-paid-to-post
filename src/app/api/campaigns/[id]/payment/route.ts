import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { isValidTronTxId } from "@/lib/validate";
import { getProfile, isOwner } from "@/lib/auth";
import { getAdminUsdtWallet } from "@/lib/data";
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
      "id, user_id, status, title, budget_total, brand_name, platform_fee, rates, view_bonus_per_1k, min_views, max_payout_per_post, payment_tx_id"
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
  // No admin wallet, no payment: if Turn has not set his USDT
  // wallet in /admin Settings, the brand could not have sent the
  // budget anywhere — recording a "payment" here would be fiction.
  // (Existence only is checked; the address value is never read
  // into this route's logic or logs.)
  const adminWallet = await getAdminUsdtWallet();
  if (!adminWallet) {
    return NextResponse.json(
      {
        error:
          "The admin's payment wallet is not set up yet — please contact the admin on Discord before sending any payment.",
      },
      { status: 503 }
    );
  }
  // A TxID already recorded cannot be silently overwritten: the
  // brand could replace the TxID Turn already started verifying,
  // with no history and no notice to the admin. Changing it needs
  // the admin (Discord).
  if ((campaign as { payment_tx_id?: string | null }).payment_tx_id) {
    return NextResponse.json(
      {
        error:
          "A Transaction ID was already submitted for this campaign — contact the admin on Discord to change it.",
      },
      { status: 400 }
    );
  }

  const body = (await request.json()) as { txId?: string };
  const txId = String(body.txId ?? "").trim();
  // A TRON transaction ID is exactly 64 hex characters. The old
  // check (8–128 chars, no whitespace) accepted any string — a
  // brand could "pay" with "aaaaaaaa" and no error would fire.
  if (!isValidTronTxId(txId)) {
    return NextResponse.json(
      {
        error:
          "Enter a valid TRON Transaction ID — 64 hexadecimal characters (the hash of your USDT transfer).",
      },
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
    message:
      "Payment submitted. The admin will verify it and your campaign will go live once payment is verified.",
  });
}
