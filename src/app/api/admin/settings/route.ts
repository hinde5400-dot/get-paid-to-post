import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { getAdminUsdtWallet } from "@/lib/data";
import { rateLimit } from "@/lib/rate-limit";

/** TRC20 USDT address: T + 33 base58 characters (same check as withdrawals). */
function isValidTrc20(address: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
}

/** Owner-only: read the saved admin USDT wallet address. */
export async function GET() {
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
  if (!isOwner(profile)) {
    return NextResponse.json(
      { error: "Admin settings are owner-only." },
      { status: 403 }
    );
  }
  const wallet = await getAdminUsdtWallet();
  return NextResponse.json({ ok: true, wallet });
}

/** Owner-only: save the admin USDT (TRC20) wallet address brands pay to. */
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
  if (!isOwner(profile)) {
    return NextResponse.json(
      { error: "Admin settings are owner-only." },
      { status: 403 }
    );
  }
  // Best-effort rate limit (see lib/rate-limit.ts): 10 saves per
  // minute per admin, same pattern as the other admin POST routes.
  const rl = rateLimit(`admin-settings:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  let body: { wallet?: string };
  try {
    body = (await request.json()) as { wallet?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request — send a valid JSON body." },
      { status: 400 }
    );
  }
  const wallet = String(body.wallet ?? "").trim();
  if (!isValidTrc20(wallet)) {
    return NextResponse.json(
      {
        error:
          "Invalid USDT wallet address — TRC20 addresses start with T and are 34 characters.",
      },
      { status: 400 }
    );
  }
  const { error } = await supabase.from("site_settings").upsert(
    {
      key: "admin_usdt_wallet",
      value: wallet,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) {
    const msg = /site_settings/i.test(error.message)
      ? "Admin settings are not set up yet (migration 0013). Please try again later."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    wallet,
    message: "Admin wallet address saved.",
  });
}
