import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Refund requests for a campaign rejected AFTER the brand paid
 * (Round-4 P2-B5). The reject itself records nothing about money
 * owed, so this route is the record: one open request per campaign
 * in the `refund_requests` table (migration 0041 — created by
 * another workstream; this route never creates the table).
 *
 * Refundable amount is the BUDGET only: the 15% platform fee is
 * not refundable (decided default, P1-Y2), so a $500 budget paid
 * as $575 total refunds $500. A rejected campaign never went live,
 * so nothing of its budget was spent — the whole budget is owed
 * back.
 *
 * POST — brand owner (or the admin) requests the refund. Only a
 * rejected campaign with a payment TxID on file can request one.
 * GET  — brand owner / admin reads whether an open request exists.
 * Both return 503 (not a crash) when the table is missing.
 */

type RefundRow = {
  id: string;
  campaign_id: string;
  user_id: string;
  amount: number;
  payment_tx_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function tableMissing(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    /refund_requests/i.test(error.message ?? "") ||
    /relation .* does not exist/i.test(error.message ?? "")
  );
}

async function loadCampaign(
  supabase: NonNullable<ReturnType<typeof getServerClient>>,
  campaignId: string
) {
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, user_id, status, title, budget_total, payment_tx_id"
    )
    .eq("id", campaignId)
    .single();
  if (error || !data) return null;
  return data as {
    id: string;
    user_id?: string | null;
    status?: string;
    title?: string | null;
    budget_total?: number;
    payment_tx_id?: string | null;
  };
}

export async function GET(
  _request: Request,
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
  const campaign = await loadCampaign(supabase, params.id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const profile = await getProfile(auth.user.id);
  const ownsIt = campaign.user_id === auth.user.id;
  if (!ownsIt && !isOwner(profile)) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const { data, error } = await supabase
    .from("refund_requests")
    .select("id, campaign_id, user_id, amount, payment_tx_id, status, created_at, updated_at")
    .eq("campaign_id", params.id)
    .eq("status", "requested")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json(
        {
          error:
            "Refund requests are not set up yet — ask the admin on Discord about your refund.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const row = (data?.[0] as RefundRow | undefined) ?? null;
  return NextResponse.json({
    refundRequested: Boolean(row),
    request: row
      ? {
          amount: Number(row.amount ?? 0),
          payment_tx_id: row.payment_tx_id,
          created_at: row.created_at,
        }
      : null,
  });
}

export async function POST(
  _request: Request,
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
  const profile = await getProfile(auth.user.id);
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
  }
  const campaign = await loadCampaign(supabase, params.id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const ownsIt = campaign.user_id === auth.user.id;
  if (!ownsIt && !isOwner(profile)) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (campaign.status !== "rejected") {
    return NextResponse.json(
      {
        error:
          "Only a rejected campaign can request a refund — this one was not rejected.",
      },
      { status: 400 }
    );
  }
  const paymentTxId = String(campaign.payment_tx_id ?? "").trim();
  if (!paymentTxId) {
    return NextResponse.json(
      {
        error:
          "No payment was recorded for this campaign, so there is nothing to refund.",
      },
      { status: 400 }
    );
  }
  const rl = rateLimit(`refund:${auth.user.id}:${params.id}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  // One open request per campaign: a second tap returns the
  // existing request instead of recording a duplicate refund.
  const { data: existing, error: existingError } = await supabase
    .from("refund_requests")
    .select("id, amount, payment_tx_id, created_at")
    .eq("campaign_id", params.id)
    .eq("status", "requested")
    .order("created_at", { ascending: false })
    .limit(1);
  if (existingError) {
    if (tableMissing(existingError)) {
      return NextResponse.json(
        {
          error:
            "Refund requests are not set up yet — ask the admin on Discord about your refund.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: existingError.message },
      { status: 400 }
    );
  }
  if (existing && existing.length > 0) {
    const row = existing[0] as RefundRow;
    return NextResponse.json({
      ok: true,
      alreadyRequested: true,
      amount: Number(row.amount ?? 0),
      message:
        "A refund for this campaign was already requested — the admin will send it in USDT.",
    });
  }
  // Budget only — the 15% platform fee is not refundable.
  const amount =
    Math.round(Number(campaign.budget_total ?? 0) * 100) / 100;
  const { error } = await supabase.from("refund_requests").insert({
    campaign_id: params.id,
    user_id: campaign.user_id,
    amount,
    payment_tx_id: paymentTxId,
    status: "requested",
  });
  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json(
        {
          error:
            "Refund requests are not set up yet — ask the admin on Discord about your refund.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    amount,
    message:
      "Refund requested — the admin will send your budget back in USDT. The 15% platform fee is not refundable.",
  });
}
