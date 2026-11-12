import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  getCampaignBudgetHistory,
  paidBudgetCoveredByPayment,
} from "@/lib/data";

/**
 * Refund requests for a campaign (migrations 0041 + 0043 + 0044).
 *
 * kind = 'rejected' (Round-4 P2-B5): the campaign was rejected
 * AFTER the brand paid. The reject itself records nothing about
 * money owed, so this route is the record: one open request per
 * campaign in the `refund_requests` table. Refundable amount is
 * the BUDGET only: the 15% platform fee is not refundable
 * (decided default, P1-Y2), so a $500 budget paid as $575 total
 * refunds $500. A rejected campaign never went live, so nothing
 * of its budget was spent — the whole budget is owed back,
 * minus any overpayment difference already sent back (see
 * below).
 *
 * kind = 'overpayment' (Round-5 P2): the budget was LOWERED
 * after the brand paid, while the campaign is still pending or
 * live — the brand overpaid the difference. The amount is
 * computed SERVER-SIDE from campaign_budget_history (the
 * earliest post-payment edit's old_budget_total, the same logic
 * as the B2 banner on the payment page): paid budget minus the
 * current budget_total. A client-sent amount is never trusted.
 * The 15% fee is not refundable here either, so the amount is
 * budget-only.
 *
 * One open request per campaign (partial unique index, migration
 * 0041): a second tap returns the existing request instead of
 * recording a duplicate refund, scoped to the same kind. When a
 * 'rejected' refund is filed on a campaign that already has an
 * open 'overpayment' request, the overpayment row is cancelled
 * first — the full-budget refund supersedes it — so the insert
 * does not trip the one-open-request index. The brand cancels
 * its own open row through the "refund_requests brand cancel own
 * open" policy (migration 0044), the same status-guarded cancel
 * the owner action uses; the cancel is verified by re-reading,
 * and only if it did not take (0044 not applied yet) does the
 * route return the honest 409 telling the brand to ask the admin
 * on Discord to close it first.
 *
 * POST — brand owner (or the admin) requests the refund. Body:
 * { kind?: 'rejected' | 'overpayment' } (default 'rejected').
 * GET  — brand owner / admin reads whether an open request exists.
 * Both return 503 (not a crash) when the table is missing.
 *
 * Pre-migration-0043 fallback: the `kind` column does not exist
 * yet, so kind is read and written best-effort. Inserts retry
 * without `kind` (the default is 'rejected'); reads treat a
 * missing kind as 'rejected' on a rejected campaign and as
 * 'overpayment' on a pending/live one (no other kind could exist
 * there yet).
 */

type RefundRow = {
  id: string;
  campaign_id: string;
  user_id: string;
  amount: number;
  payment_tx_id: string | null;
  status: string;
  kind?: string;
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

/** True when a PostgREST error is "column X does not exist"
 *  (42703) — i.e. migration 0043 has not been applied yet. */
function columnMissing(
  error: { message?: string; code?: string } | null,
  column: string
) {
  if (!error) return false;
  return (
    error.code === "42703" && (error.message ?? "").includes(column)
  );
}

async function loadCampaign(
  supabase: NonNullable<ReturnType<typeof getServerClient>>,
  campaignId: string
) {
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, user_id, status, title, budget_total, payment_tx_id, payment_tx_submitted_at, created_at"
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
    payment_tx_submitted_at?: string | null;
    created_at?: string | null;
  };
}

/** Open requests on one campaign, with `kind` merged in
 *  best-effort (see header — pre-0043 the column is missing and
 *  kind stays undefined). Throws tableMissing-style errors to the
 *  caller; callers translate them to 503. */
async function loadOpenRequests(
  supabase: NonNullable<ReturnType<typeof getServerClient>>,
  campaignId: string
): Promise<RefundRow[]> {
  const { data, error } = await supabase
    .from("refund_requests")
    .select("id, amount, payment_tx_id, created_at")
    .eq("campaign_id", campaignId)
    .eq("status", "requested")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RefundRow[];
  const { data: kindRows, error: kindError } = await supabase
    .from("refund_requests")
    .select("id, kind")
    .eq("campaign_id", campaignId)
    .eq("status", "requested");
  if (!kindError && kindRows) {
    const kindById = new Map(
      (kindRows as { id: string; kind?: string }[]).map((k) => [
        String(k.id),
        String(k.kind ?? ""),
      ])
    );
    for (const row of rows) {
      const kind = kindById.get(row.id);
      if (kind) row.kind = kind;
    }
  }
  return rows;
}

/** Insert a refund request, writing `kind` when the column
 *  exists and retrying without it before migration 0043. */
async function insertRequest(
  supabase: NonNullable<ReturnType<typeof getServerClient>>,
  fields: {
    campaign_id: string;
    user_id: string | null | undefined;
    amount: number;
    payment_tx_id: string;
    status: string;
    kind: string;
  }
) {
  const { error } = await supabase.from("refund_requests").insert(fields);
  if (error && columnMissing(error, "kind")) {
    const { kind: _dropped, ...withoutKind } = fields;
    return supabase.from("refund_requests").insert(withoutKind);
  }
  return { error };
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
  // kind is best-effort (pre-0043 the column does not exist).
  let kind: string | undefined;
  if (row) {
    const { data: kindRows, error: kindError } = await supabase
      .from("refund_requests")
      .select("kind")
      .eq("id", row.id)
      .maybeSingle();
    if (!kindError && kindRows) {
      kind = (kindRows as { kind?: string }).kind ?? undefined;
    }
  }
  return NextResponse.json({
    refundRequested: Boolean(row),
    request: row
      ? {
          amount: Number(row.amount ?? 0),
          payment_tx_id: row.payment_tx_id,
          created_at: row.created_at,
          ...(kind ? { kind } : {}),
        }
      : null,
  });
}

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
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
  };
  const kind =
    body.kind === undefined ? "rejected" : String(body.kind);
  if (kind !== "rejected" && kind !== "overpayment") {
    return NextResponse.json(
      { error: "kind must be 'rejected' or 'overpayment'." },
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

  // ---- Overpayment (budget lowered after payment) ----
  if (kind === "overpayment") {
    if (campaign.status !== "pending" && campaign.status !== "live") {
      return NextResponse.json(
        {
          error:
            "Only a pending or live campaign can request an overpayment refund — a rejected campaign refunds its whole budget instead.",
        },
        { status: 400 }
      );
    }
    // Paid amount, computed server-side from the budget history
    // — never a client-sent number. See paidBudgetCoveredByPayment
    // (the earliest post-payment edit's old_budget_total).
    let paidBudget: number | null;
    try {
      const historyById = await getCampaignBudgetHistory([params.id]);
      paidBudget = paidBudgetCoveredByPayment(
        historyById[params.id] ?? [],
        campaign.payment_tx_submitted_at ?? null,
        campaign.created_at ?? null
      );
    } catch {
      return NextResponse.json(
        { error: "Could not verify the paid amount — please try again." },
        { status: 400 }
      );
    }
    if (paidBudget == null) {
      return NextResponse.json(
        {
          error:
            "No budget change was recorded after your payment, so there is no overpaid difference to refund.",
        },
        { status: 400 }
      );
    }
    // Budget only — the 15% platform fee is not refundable.
    const amount =
      Math.round((paidBudget - Number(campaign.budget_total ?? 0)) * 100) /
      100;
    if (amount <= 0) {
      return NextResponse.json(
        {
          error:
            "Your payment covers the current budget — there is no overpaid difference to refund.",
        },
        { status: 400 }
      );
    }
    // One open request per campaign, scoped to this kind: a
    // second tap returns the existing request instead of
    // recording a duplicate refund.
    let open: RefundRow[];
    try {
      open = await loadOpenRequests(supabase, params.id);
    } catch (e) {
      if (tableMissing(e as { message?: string; code?: string } | null)) {
        return NextResponse.json(
          {
            error:
              "Refund requests are not set up yet — ask the admin on Discord about your refund.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: (e as Error).message ?? "Could not check refund requests." },
        { status: 400 }
      );
    }
    const existing = open.find(
      (r) =>
        r.kind === "overpayment" ||
        // Pre-0043: no kind recorded — an open request on a
        // pending/live campaign can only be an overpayment one
        // (a rejected refund cannot exist here).
        r.kind === undefined
    );
    if (existing) {
      return NextResponse.json({
        ok: true,
        alreadyRequested: true,
        amount: Number(existing.amount ?? 0),
        message:
          "An overpayment refund for this campaign was already requested — the admin will send it in USDT.",
      });
    }
    const { error } = await insertRequest(supabase, {
      campaign_id: params.id,
      user_id: campaign.user_id,
      amount,
      payment_tx_id: paymentTxId,
      status: "requested",
      kind: "overpayment",
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
        "Overpayment refund requested — the admin will send the overpaid budget back in USDT. The 15% platform fee is not refundable.",
    });
  }

  // ---- Rejected campaign (whole budget back) ----
  if (campaign.status !== "rejected") {
    return NextResponse.json(
      {
        error:
          "Only a rejected campaign can request a refund — this one was not rejected.",
      },
      { status: 400 }
    );
  }
  // One open request per campaign, scoped to this kind: a second
  // tap returns the existing request instead of recording a
  // duplicate refund.
  let open: RefundRow[];
  try {
    open = await loadOpenRequests(supabase, params.id);
  } catch (e) {
    if (tableMissing(e as { message?: string; code?: string } | null)) {
      return NextResponse.json(
        {
          error:
            "Refund requests are not set up yet — ask the admin on Discord about your refund.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: (e as Error).message ?? "Could not check refund requests." },
      { status: 400 }
    );
  }
  const existing = open.find(
    (r) => r.kind === "rejected" || r.kind === undefined
  );
  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyRequested: true,
      amount: Number(existing.amount ?? 0),
      message:
        "A refund for this campaign was already requested — the admin will send it in USDT.",
    });
  }
  // A 'rejected' refund supersedes an open 'overpayment' one on
  // the same campaign: close the overpayment row as 'cancelled'
  // FIRST, or the one-open-request-per-campaign index blocks the
  // insert below. The brand cancels its OWN open row through the
  // "refund_requests brand cancel own open" policy (migration
  // 0044, Round-6 A8) — the update is status-guarded, so it only
  // ever flips a still-'requested' row to 'cancelled'. The cancel
  // is verified by re-reading: before 0044 is applied the brand
  // has no UPDATE policy, the update silently matches zero rows
  // and the overpayment stays open (the owner filing the same
  // request cancels it fine). When the cancel did not take, say
  // so honestly instead of failing on the unique index: the admin
  // closes the overpayment request, then the full refund can be
  // filed.
  const openOverpayment = open.filter((r) => r.kind === "overpayment");
  if (openOverpayment.length > 0) {
    await supabase
      .from("refund_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in(
        "id",
        openOverpayment.map((r) => r.id)
      )
      .eq("status", "requested");
    let stillOpen: RefundRow[] = [];
    try {
      stillOpen = await loadOpenRequests(supabase, params.id);
    } catch {
      // A failed re-read is treated as "cancel unverified" —
      // the message below still applies.
      stillOpen = openOverpayment;
    }
    if (stillOpen.some((r) => r.kind === "overpayment")) {
      return NextResponse.json(
        {
          error:
            "You already have an open refund request for the overpaid difference on this campaign. Ask the admin on Discord to close it first — they will then send the full budget refund.",
        },
        { status: 409 }
      );
    }
  }
  // Budget only — the 15% platform fee is not refundable — minus
  // any overpayment difference already sent back on this
  // campaign, so a brand that already got the overpaid part back
  // is not paid it twice. Best-effort: before 0043 the kind
  // select errors and nothing is subtracted (no overpayment
  // could have been tracked then).
  let alreadySentOverpayment = 0;
  const { data: sentRows } = await supabase
    .from("refund_requests")
    .select("amount, kind")
    .eq("campaign_id", params.id)
    .eq("status", "sent");
  for (const row of (sentRows ?? []) as {
    amount?: number;
    kind?: string;
  }[]) {
    if (row.kind === "overpayment") {
      alreadySentOverpayment += Number(row.amount ?? 0);
    }
  }
  const amount = Math.max(
    0,
    Math.round(
      (Number(campaign.budget_total ?? 0) - alreadySentOverpayment) * 100
    ) / 100
  );
  if (amount <= 0) {
    return NextResponse.json(
      {
        error:
          "The budget for this campaign has already been refunded.",
      },
      { status: 400 }
    );
  }
  const { error } = await insertRequest(supabase, {
    campaign_id: params.id,
    user_id: campaign.user_id,
    amount,
    payment_tx_id: paymentTxId,
    status: "requested",
    kind: "rejected",
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
      alreadySentOverpayment > 0
        ? "Refund requested — the admin will send the remaining budget back in USDT. The 15% platform fee is not refundable."
        : "Refund requested — the admin will send your budget back in USDT. The 15% platform fee is not refundable.",
  });
}
