import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { isValidTronTxId } from "@/lib/validate";

/**
 * Owner-only withdrawal review. Mirrors the owner check in
 * api/admin/review. Approve → "approved", Mark paid → "paid",
 * Reject → "rejected" and the deducted amount is refunded to the
 * creator's available balance.
 *
 * P0-1 design (withdrawn_total moves at REQUEST time): the
 * creator's withdrawal request already moved withdrawn_total
 * (available -= amount AND withdrawn_total += amount — the
 * wallet-update trigger in migration 0010 only allows a
 * non-owner debit in that shape). So "mark paid" here only flips
 * the status and must NOT move withdrawn_total again (the old
 * code incremented it here, which both contradicted the trigger
 * and double-counted nothing — it just never ran for the request
 * debit, which the trigger rejected). A reject reverses BOTH
 * fields (available += amount, withdrawn_total -= amount,
 * floored at 0 so a legacy row that never moved withdrawn_total
 * is not driven negative).
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
    return NextResponse.json(
      { error: "Please log in first." },
      { status: 401 }
    );
  }
  const profile = await getProfile(auth.user.id);
  if (!isOwner(profile)) {
    return NextResponse.json(
      { error: "Admin Review is owner-only." },
      { status: 403 }
    );
  }
  // Best-effort rate limit (see lib/rate-limit.ts): 10 withdrawal
  // decisions per minute per admin — approve/paid/reject move
  // money, so rapid-fire clicks are throttled.
  const rl = rateLimit(`admin-withdrawals:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  let body: {
    withdrawalId?: string;
    action?: "approve" | "paid" | "reject";
    payoutTxId?: string;
  };
  try {
    body = (await request.json()) as {
      withdrawalId?: string;
      action?: "approve" | "paid" | "reject";
      payoutTxId?: string;
    };
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }
  // Round-4 P1-A3: the payout Transaction ID is optional on Mark
  // paid — the owner may have sent the USDT before 0040, or may
  // paste the hash later — but when one is given it must be a
  // real TRON hash (exactly 64 hex chars, same rule as brand
  // TxIDs), or "Paid" stays unverifiable.
  const payoutTxId = String(body.payoutTxId ?? "").trim();
  if (body.action === "paid" && payoutTxId && !isValidTronTxId(payoutTxId)) {
    return NextResponse.json(
      {
        error:
          "Invalid payout Transaction ID — it must be exactly 64 hexadecimal characters (the hash of the USDT transfer).",
      },
      { status: 400 }
    );
  }
  const { data: w, error } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("id", body.withdrawalId ?? "")
    .single();
  if (error || !w) {
    return NextResponse.json(
      { error: "Withdrawal not found." },
      { status: 404 }
    );
  }
  const row = w as Record<string, unknown>;
  const amount = Number(row.amount ?? 0);

  // Status machine: pending → approved → paid. Reject is allowed
  // from pending or approved (money was debited at request time,
  // so it is refunded). Nothing moves backwards: a rejected row
  // can never be marked paid, a paid row can never be re-rejected.
  // Every transition is status-guarded in the UPDATE itself, so a
  // concurrent second click cannot apply the same transition twice.
  if (body.action === "reject") {
    if (row.status !== "pending" && row.status !== "approved") {
      return NextResponse.json(
        {
          error: `This withdrawal is ${String(row.status)} and cannot be rejected.`,
        },
        { status: 400 }
      );
    }
    // Status FIRST, refund SECOND — the old code refunded first
    // and only then ran the status-guarded update, so two
    // concurrent rejects (or a reject racing a "mark paid") BOTH
    // refunded the money while only one won the status race: the
    // loser returned 409 "already decided" AFTER already crediting
    // the creator's available balance a second time. Flipping the
    // guarded status first means exactly one caller ever reaches
    // the refund — the loser gets 409 before touching any wallet.
    const previousStatus = String(row.status);
    const { data: rejected, error: rejectError } = await supabase
      .from("withdrawals")
      .update({ status: "rejected" })
      .eq("id", row.id as string)
      .in("status", ["pending", "approved"])
      .select("id");
    if (rejectError || !rejected || rejected.length === 0) {
      return NextResponse.json(
        {
          error:
            "This withdrawal was already decided — reload /admin to see its current status.",
        },
        { status: 409 }
      );
    }
    // Refund: the amount was debited from the creator's available
    // balance when they requested it — an approved (not yet paid)
    // withdrawal gets it back too. P0-1: reverse BOTH sides of
    // the request-time debit — available += amount AND
    // withdrawn_total -= amount (floored at 0: a legacy row
    // created before the fix never moved withdrawn_total, so
    // there is nothing to take back).
    //
    // P1-4: atomic refund (migration 0038). The old code read
    // the wallet once and wrote absolute values with no guard,
    // so a creator's own withdrawal debit landing between the
    // read and the write was overwritten and the debit vanished
    // while its withdrawal row still existed. The RPC moves both
    // fields inside the database.
    let refunded = false;
    const {
      data: refundRows,
      error: refundError,
    } = await supabase.rpc("refund_wallet_withdrawal", {
      p_user_id: row.user_id as string,
      p_amount: amount,
    });
    if (refundError) {
      // The status already flipped to rejected above, so put it
      // back to what it was — otherwise the row would sit
      // rejected with the money never refunded, and no retry
      // would be possible (reject is blocked from "rejected").
      await supabase
        .from("withdrawals")
        .update({ status: previousStatus })
        .eq("id", row.id as string)
        .eq("status", "rejected");
      return NextResponse.json(
        {
          error: `Could not refund the amount (${refundError.message}). The withdrawal was NOT rejected — try again (run migration 0038 in Supabase first if the function is missing).`,
        },
        { status: 500 }
      );
    }
    const refundResult = (refundRows as
      | { ok: boolean }[]
      | null)?.[0];
    // ok = false means no wallet row exists for this creator:
    // nothing was debited for this request, so there is nothing
    // to refund — the rejection still stands.
    refunded = Boolean(refundResult?.ok);
    return NextResponse.json({
      ok: true,
      message: refunded
        ? "Withdrawal rejected — the amount was refunded to the creator's balance."
        : "Withdrawal rejected — no balance was debited for this request, so there was nothing to refund.",
    });
  }

  if (body.action === "approve") {
    if (row.status !== "pending") {
      return NextResponse.json(
        {
          error: `Only a pending withdrawal can be approved (this one is ${String(row.status)}).`,
        },
        { status: 400 }
      );
    }
    const { data: approved, error: approveError } = await supabase
      .from("withdrawals")
      .update({ status: "approved" })
      .eq("id", row.id as string)
      .eq("status", "pending")
      .select("id");
    if (approveError || !approved || approved.length === 0) {
      return NextResponse.json(
        {
          error:
            "This withdrawal was already decided — reload /admin to see its current status.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, message: "Withdrawal approved." });
  }

  if (body.action === "paid") {
    if (row.status !== "approved") {
      return NextResponse.json(
        {
          error: `Only an approved withdrawal can be marked paid (this one is ${String(row.status)}).`,
        },
        { status: 400 }
      );
    }
    // P1-A3: record the payout Transaction ID alongside the
    // status flip, so a creator disputing a payout ("I never
    // received it") can be answered from the site with a
    // Tronscan link. Stored lowercase, like brand TxIDs.
    const paidUpdate: Record<string, unknown> = { status: "paid" };
    if (payoutTxId) paidUpdate.payout_tx_id = payoutTxId.toLowerCase();
    const { data: paid, error: paidError } = await supabase
      .from("withdrawals")
      .update(paidUpdate)
      .eq("id", row.id as string)
      .eq("status", "approved")
      .select("id");
    if (paidError || !paid || paid.length === 0) {
      // A missing payout_tx_id column (migration 0040 not run
      // yet) fails the update even though the status flip itself
      // is fine — say so loudly instead of silently dropping
      // the TxID or reporting a false "already decided".
      if (payoutTxId && /payout_tx_id/i.test(paidError?.message ?? "")) {
        return NextResponse.json(
          {
            error:
              "Could not save the payout Transaction ID (run migration 0040 in Supabase first). The withdrawal was NOT marked paid — try again after the migration.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        {
          error:
            "This withdrawal was already decided — reload /admin to see its current status.",
        },
        { status: 409 }
      );
    }
    // P0-1: "Total withdrawn" was already moved at request time
    // (available -= amount AND withdrawn_total += amount in
    // POST /api/withdrawals — the wallet trigger's withdrawal
    // shape). Marking paid only flips the status; incrementing
    // withdrawn_total here again would double-count it.
    return NextResponse.json({
      ok: true,
      message: payoutTxId
        ? `Withdrawal marked as paid (TxID ${payoutTxId.toLowerCase()}).`
        : "Withdrawal marked as paid.",
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
