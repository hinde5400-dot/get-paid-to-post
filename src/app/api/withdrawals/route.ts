import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { feeFor, finalFor } from "@/lib/money";
import { WITHDRAW_MIN } from "@/lib/constants";

export async function GET() {
  const supabase = getServerClient();
  if (!supabase) return NextResponse.json({ withdrawals: [] });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }
  const { data } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ withdrawals: data ?? [] });
}

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
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
  }
  const body = (await request.json()) as {
    amount?: number;
    method?: string;
    details?: string;
  };
  const amount = Number(body.amount ?? 0);
  const method = String(body.method ?? "").trim();
  const details = String(body.details ?? "").trim();
  if (!["usdt", "pakistani_bank", "wise"].includes(method)) {
    return NextResponse.json(
      { error: "Choose a payout method: USDT, Pakistani bank, or Wise." },
      { status: 400 }
    );
  }
  if (!details) {
    return NextResponse.json(
      { error: "Please enter your payout details." },
      { status: 400 }
    );
  }
  if (amount < WITHDRAW_MIN) {
    return NextResponse.json(
      { error: `Minimum withdrawal is $${WITHDRAW_MIN}.` },
      { status: 400 }
    );
  }
  const { data: wallet } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", auth.user.id)
    .single();
  const available = Number(wallet?.available_balance ?? 0);
  if (amount > available) {
    return NextResponse.json(
      { error: "Amount is more than your available balance." },
      { status: 400 }
    );
  }
  const fee = feeFor(amount);
  const final = finalFor(amount);
  const { error: insError } = await supabase.from("withdrawals").insert({
    user_id: auth.user.id,
    amount,
    fee,
    final_amount: final,
    method,
    details,
    status: "pending",
  });
  if (insError) {
    return NextResponse.json({ error: insError.message }, { status: 400 });
  }
  if (wallet) {
    await supabase
      .from("wallets")
      .update({
        available_balance: available - amount,
        withdrawn_total: Number(wallet.withdrawn_total ?? 0) + amount,
      })
      .eq("user_id", auth.user.id);
  }
  return NextResponse.json({
    ok: true,
    message: `Withdrawal requested — you will receive $${final.toFixed(2)} after the 7% fee.`,
    finalAmount: final,
  });
}
