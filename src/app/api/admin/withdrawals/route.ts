import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";

/**
 * Owner-only withdrawal review. Mirrors the owner check in
 * api/admin/review. Approve → "approved", Mark paid → "paid",
 * Reject → "rejected" and the deducted amount is refunded to the
 * creator's available balance.
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

  const body = (await request.json()) as {
    withdrawalId?: string;
    action?: "approve" | "paid" | "reject";
  };
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
    // Refund FIRST: the amount was debited from the creator's
    // available balance when they requested it — an approved (not
    // yet paid) withdrawal gets it back too. The old code refunded
    // pending rows only, then told the owner the refund happened
    // for every row.
    let refunded = false;
    const { data: wallet } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", row.user_id as string)
      .single();
    if (wallet) {
      const wRow = wallet as Record<string, unknown>;
      const { error: refundError } = await supabase
        .from("wallets")
        .update({
          available_balance:
            Number(wRow.available_balance ?? 0) + amount,
        })
        .eq("user_id", row.user_id as string);
      if (refundError) {
        return NextResponse.json(
          {
            error: `Could not refund the amount (${refundError.message}). The withdrawal was NOT rejected — try again.`,
          },
          { status: 500 }
        );
      }
      refunded = true;
    }
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
    const { data: paid, error: paidError } = await supabase
      .from("withdrawals")
      .update({ status: "paid" })
      .eq("id", row.id as string)
      .eq("status", "approved")
      .select("id");
    if (paidError || !paid || paid.length === 0) {
      return NextResponse.json(
        {
          error:
            "This withdrawal was already decided — reload /admin to see its current status.",
        },
        { status: 409 }
      );
    }
    // "Total withdrawn" counts money actually sent — it is
    // incremented here, at payment, not at request time. (A
    // pending or approved request is not money withdrawn.)
    const { data: wallet } = await supabase
      .from("wallets")
      .select("withdrawn_total")
      .eq("user_id", row.user_id as string)
      .single();
    if (wallet) {
      const { error: totalError } = await supabase
        .from("wallets")
        .update({
          withdrawn_total:
            Number(
              (wallet as Record<string, unknown>).withdrawn_total ?? 0
            ) + amount,
        })
        .eq("user_id", row.user_id as string);
      if (totalError) {
        // The withdrawal IS marked paid; only the running total
        // failed to update. Say so plainly instead of hiding it.
        return NextResponse.json({
          ok: true,
          message: `Withdrawal marked as paid, but the creator's "total withdrawn" could not be updated (${totalError.message}) — fix it in /admin.`,
        });
      }
    }
    return NextResponse.json({
      ok: true,
      message: "Withdrawal marked as paid.",
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
