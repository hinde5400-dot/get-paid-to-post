import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { isValidTronTxId } from "@/lib/validate";
import { getProfile, isOwner } from "@/lib/auth";
import { getAdminUsdtWallet, isExpiredUnpaidPending } from "@/lib/data";
import { notifyPaymentProof } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import type { NotifyCampaign } from "@/lib/notify";

/**
 * Brand records the Transaction ID / hash of the USDT budget payment
 * for their own pending campaign. Only the campaign's brand owner
 * (or the admin) may do this, and only while the campaign is still
 * pending. The RLS trigger (migration 0013) enforces the same rule
 * at the database level: a brand may change nothing but the
 * payment_tx_id of their own pending campaign.
 *
 * A TxID may be CORRECTED while the campaign is still pending and
 * not yet approved: the form says so, so the API allows replacing
 * the stored TxID (validated as 64-hex, same as the first submit)
 * and the admin card shows the current one. Once the campaign is
 * live / approved / rejected, the TxID is frozen.
 *
 * Guards: 7-day expiry (migration 0030 — an unpaid pending
 * campaign cannot record a payment after it expired), TxID
 * uniqueness across campaigns (one real payment cannot "fund"
 * two campaigns), and a 10/min rate limit.
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
      "id, user_id, status, title, budget_total, brand_name, platform_fee, rates, view_bonus_per_1k, min_views, max_payout_per_post, payment_tx_id, payment_tx_submitted_at, created_at"
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
  // A blocked account records no payment.
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
  }
  if ((campaign as { status?: string }).status !== "pending") {
    return NextResponse.json(
      { error: "Only a pending campaign can record a payment." },
      { status: 400 }
    );
  }
  // 7-day expiry (migration 0030): an unpaid pending campaign
  // cannot record a payment once it is 7+ days old — the daily
  // cron deletes it, and this check closes the gap between
  // creation+7d and the next cron run.
  if (
    isExpiredUnpaidPending(
      campaign as {
        status?: string | null;
        payment_tx_id?: string | null;
        payment_tx_submitted_at?: string | null;
        created_at?: string | null;
      }
    )
  ) {
    return NextResponse.json(
      {
        error:
          "This campaign expired unpaid — unpaid pending campaigns expire 7 days after they are created. Create a new campaign to pay again.",
      },
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
  // Best-effort rate limit (see lib/rate-limit.ts): 10 payment
  // submissions per minute per user per campaign.
  const rl = rateLimit(`payment:${auth.user.id}:${params.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many payment attempts — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  let body: { txId?: string };
  try {
    body = (await request.json()) as { txId?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request — send a valid JSON body." },
      { status: 400 }
    );
  }
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
  // Hex is case-insensitive: store the TxID lowercase so the
  // uniqueness check below (and the admin's wallet check) compare
  // one canonical spelling.
  const txIdLower = txId.toLowerCase();
  // One real payment cannot "fund" two campaigns: the same TxID
  // on any OTHER campaign is rejected. Enforced here, at approve
  // time, and by the unique partial index on lower(payment_tx_id)
  // (migration 0038) — the index is the backstop for a race
  // between the check below and the update. The check is
  // case-insensitive — ilike, because hex has no LIKE wildcards
  // in it.
  const { data: txClash } = await supabase
    .from("campaigns")
    .select("id")
    .ilike("payment_tx_id", txIdLower)
    .neq("id", params.id)
    .limit(1);
  if (txClash && txClash.length > 0) {
    return NextResponse.json(
      {
        error:
          "This Transaction ID was already used on another campaign — one payment cannot fund two campaigns.",
      },
      { status: 400 }
    );
  }

  const previousTxId = String(
    (campaign as { payment_tx_id?: string | null }).payment_tx_id ?? ""
  ).trim();
  const isCorrection = Boolean(previousTxId) && previousTxId.toLowerCase() !== txIdLower;

  // Round-4 P2-B2: re-submitting the IDENTICAL TxID changes
  // nothing — no re-stamp of payment_tx_submitted_at (which would
  // restart the 7-day expiry) and no second Discord alert. The
  // brand just gets told it is already on file.
  if (Boolean(previousTxId) && previousTxId.toLowerCase() === txIdLower) {
    return NextResponse.json({
      ok: true,
      unchanged: true,
      message:
        "This Transaction ID is already on file — nothing changed.",
    });
  }

  // P1-7 (migration 0038): stamp the server time of this TxID
  // submission — first submit and every correction. The 7-day
  // expiry for a TxID-on-file campaign runs from this stamp, so
  // a correction restarts the window; without it a pasted hash
  // would defeat expiry forever. An IDENTICAL re-submit never
  // reaches this update (returned early above, P2-B2).
  const { error } = await supabase
    .from("campaigns")
    .update({
      payment_tx_id: txIdLower,
      payment_tx_submitted_at: new Date().toISOString(),
    })
    .eq("id", params.id);
  if (error) {
    // A unique-violation on the 0038 partial index means the TxID
    // landed on another campaign between the clash check and the
    // update — report it as "already used", not a setup error.
    const isUniqueViolation =
      (error as { code?: string }).code === "23505" ||
      /duplicate key|payment_tx_id/i.test(error.message);
    const msg = isUniqueViolation
      ? "This Transaction ID was already used on another campaign — one payment cannot fund two campaigns."
      : /payment_tx_id/i.test(error.message)
        ? "Payment system is not set up yet (migration 0013). Please try again later."
        : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  // Notify the owner on Discord (Item 11b) — full campaign details
  // + TxID, fire-and-forget. A Discord failure never breaks the
  // brand's request; no webhook is configured yet, so this is a
  // silent no-op until Turn creates one. A correction notifies
  // again, so the admin never verifies a stale TxID.
  void notifyPaymentProof(campaign as unknown as NotifyCampaign, {
    txId: txIdLower,
  });
  return NextResponse.json({
    ok: true,
    corrected: isCorrection,
    message: isCorrection
      ? "Transaction ID updated. The admin will verify the new one and your campaign will go live once payment is verified."
      : "Payment submitted. The admin will verify it and your campaign will go live once payment is verified.",
  });
}
