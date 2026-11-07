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

  if (body.action === "reject") {
    if (row.status === "pending") {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", row.user_id as string)
        .single();
      if (wallet) {
        const wRow = wallet as Record<string, unknown>;
        await supabase
          .from("wallets")
          .update({
            available_balance:
              Number(wRow.available_balance ?? 0) + Number(row.amount ?? 0),
            withdrawn_total: Math.max(
              0,
              Number(wRow.withdrawn_total ?? 0) - Number(row.amount ?? 0)
            ),
          })
          .eq("user_id", row.user_id as string);
      }
    }
    await supabase
      .from("withdrawals")
      .update({ status: "rejected" })
      .eq("id", row.id as string);
    return NextResponse.json({
      ok: true,
      message: "Withdrawal rejected — the amount was refunded to the creator's balance.",
    });
  }

  if (body.action === "approve") {
    await supabase
      .from("withdrawals")
      .update({ status: "approved" })
      .eq("id", row.id as string);
    return NextResponse.json({ ok: true, message: "Withdrawal approved." });
  }

  if (body.action === "paid") {
    await supabase
      .from("withdrawals")
      .update({ status: "paid" })
      .eq("id", row.id as string);
    return NextResponse.json({
      ok: true,
      message: "Withdrawal marked as paid.",
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
