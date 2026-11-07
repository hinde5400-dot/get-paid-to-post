import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { releaseMaturedHolds } from "@/lib/data";
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
  if (!["usdt_trc20", "usdt_bep20"].includes(method)) {
    return NextResponse.json(
      { error: "Choose a payout method: USDT (TRC20) or USDT (BEP20)." },
      { status: 400 }
    );
  }
  if (!details) {
    return NextResponse.json(
      { error: "Please enter your USDT wallet address." },
      { status: 400 }
    );
  }
  // Basic USDT wallet address check — TRC20 is base58 starting with T,
  // BEP20 is an Ethereum-style 0x address.
  const addressOk =
    method === "usdt_trc20"
      ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(details)
      : /^0x[a-fA-F0-9]{40}$/.test(details);
  if (!addressOk) {
    return NextResponse.json(
      { error: "Invalid USDT wallet address" },
      { status: 400 }
    );
  }
  if (amount < WITHDRAW_MIN) {
    return NextResponse.json(
      { error: `Minimum withdrawal is $${WITHDRAW_MIN}` },
      { status: 400 }
    );
  }
  // Release matured 72-hour holds first, so the balance checked below
  // is never stale (see migration 0011).
  await releaseMaturedHolds();
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
