import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { releaseMaturedHolds } from "@/lib/data";
import { feeFor, finalFor } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
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
    .order("created_at", { ascending: false })
    // Round-4 P2-A3: explicit 2,000-row cap, disclosed — past
    // 2,000 requests the OLDEST rows drop out of the creator's
    // withdrawal history (same truncation class as
    // getAllWithdrawals). Withdrawals grow slowly (one row per
    // request), so this only bites after years of use.
    .limit(2000);
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
  // Best-effort rate limit (see lib/rate-limit.ts): 5 withdrawal
  // requests per minute per user — this is a money route with no
  // idempotency key, so rapid double-submits/retries must not
  // create multiple withdrawals.
  const rl = rateLimit(`withdrawals:${auth.user.id}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many withdrawal requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  let body: { amount?: number; method?: string; details?: string };
  try {
    body = (await request.json()) as {
      amount?: number;
      method?: string;
      details?: string;
    };
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }
  // Round to cents FIRST — the fee/final were already rounded, but
  // the amount itself (and the debit below) never was, so the DB
  // numeric(12,2) rounding could make the stored withdrawal differ
  // from the debited balance by a cent.
  const amount = Math.round(Number(body.amount ?? 0) * 100) / 100;
  const method = String(body.method ?? "").trim();
  const details = String(body.details ?? "").trim();
  // TRC20 only (Turn's decision 2026-11-11): any other method
  // value is rejected, even if an old client still sends it.
  if (method !== "usdt_trc20") {
    return NextResponse.json(
      { error: "Payouts are USDT (TRC20) only." },
      { status: 400 }
    );
  }
  if (!details) {
    return NextResponse.json(
      { error: "Please enter your USDT wallet address." },
      { status: 400 }
    );
  }
  // TRC20 USDT wallet address check — base58, starts with T,
  // 34 characters total.
  const addressOk = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(details);
  if (!addressOk) {
    return NextResponse.json(
      { error: "Invalid USDT wallet address" },
      { status: 400 }
    );
  }
  // Non-finite amounts ("abc", Infinity) used to sail past both
  // guards: every comparison with NaN is false, so the outcome
  // depended on how Supabase serialises NaN instead of a clean
  // validation error.
  if (!Number.isFinite(amount) || amount < WITHDRAW_MIN) {
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
  const { data: inserted, error: insError } = await supabase
    .from("withdrawals")
    .insert({
      user_id: auth.user.id,
      amount,
      fee,
      final_amount: final,
      method,
      details,
      status: "pending",
    })
    .select("id")
    .single();
  if (insError || !inserted) {
    return NextResponse.json(
      { error: insError?.message ?? "Could not create the withdrawal." },
      { status: 400 }
    );
  }
  if (wallet) {
    // Debit with optimistic concurrency: the update only matches
    // when the balance is still exactly what was read above.
    // Two concurrent requests both read the same balance — the
    // second one's update matches zero rows instead of debiting
    // the same money twice. Balances are numeric(12,2), so the
    // equality is exact. A failed debit rolls the withdrawal row
    // back — the old code left the row in place and reported
    // success with the money never debited.
    //
    // P0-1: the wallet-update trigger (migration 0010,
    // enforce_wallet_update) allows a non-owner wallet update
    // ONLY as a withdrawal — available_delta < 0 AND
    // withdrawn_delta = -available_delta AND pending_delta = 0.
    // Debiting available alone (withdrawn_delta = 0) is rejected
    // by the trigger, so EVERY withdrawal failed here. The debit
    // therefore moves withdrawn_total at REQUEST time (available
    // -= amount AND withdrawn_total += amount); "mark paid" in
    // /api/admin/withdrawals only flips the status and must NOT
    // move withdrawn_total again, and a reject reverses both
    // fields. The owner bypasses the trigger, so the admin route
    // is unaffected either way — the trigger is what forces this
    // shape for the creator's own request.
    const withdrawnTotal = Number(
      (wallet as Record<string, unknown>).withdrawn_total ?? 0
    );
    const { data: debited, error: debitError } = await supabase
      .from("wallets")
      .update({
        available_balance: available - amount,
        withdrawn_total: Math.round((withdrawnTotal + amount) * 100) / 100,
      })
      .eq("user_id", auth.user.id)
      .eq("available_balance", available)
      .select("user_id");
    if (debitError || !debited || debited.length === 0) {
      await supabase
        .from("withdrawals")
        .delete()
        .eq("id", (inserted as { id: string }).id);
      return NextResponse.json(
        {
          error:
            "Your balance changed while this request was processed — please try again. No withdrawal was created.",
        },
        { status: 409 }
      );
    }
  }
  return NextResponse.json({
    ok: true,
    message: `Withdrawal requested — you'll receive $${final.toFixed(2)} after the 5% fee if approved.`,
    finalAmount: final,
  });
}
