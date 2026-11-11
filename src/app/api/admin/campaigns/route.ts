import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import {
  CAMPAIGN_REJECTED_MESSAGE_PREFIX,
  isExpiredUnpaidPending,
} from "@/lib/data";
import { rateLimit } from "@/lib/rate-limit";

interface CampaignReviewBody {
  campaignId?: string;
  action?: "approve" | "reject";
  /** Reject only: why the campaign was rejected (required). */
  reason?: string;
  /** Approve only: the admin confirms they verified the extra
   *  budget + 15% fee arrived after a budget edit (see below). */
  confirmUnderfunded?: boolean;
}

/**
 * Owner-only campaign approval (mirrors api/admin/review).
 * Approve → status "live" AND is_funded = true: approval means the
 * owner confirmed the brand's budget actually reached him, and
 * Discover only lists campaigns that are BOTH funded and live.
 * Reject → status "rejected": the campaign is never shown anywhere.
 * Reject REQUIRES a reason (≤200 chars): it is stored as an admin
 * message in the campaign's brand chat thread (there is no
 * rejection_reason column on campaigns — migration 0020's column
 * lives on submissions only — and this batch adds no migration)
 * and returned in the response, so the brand sees WHY it was
 * rejected on its dashboard and payment page.
 *
 * Approve guards, in order: still pending; not expired unpaid
 * (7-day rule, migration 0030); a payment TxID is recorded; that
 * TxID is not already used on another campaign; and the budget
 * was not edited while a TxID was on file without the admin
 * confirming the extra budget + fee arrived (see below).
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
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }
  const profile = await getProfile(auth.user.id);
  if (!isOwner(profile)) {
    return NextResponse.json(
      { error: "Admin Review is owner-only." },
      { status: 403 }
    );
  }
  // Best-effort rate limit (see lib/rate-limit.ts): 10 campaign
  // decisions per minute per admin — approve/reject are
  // irreversible, so rapid-fire clicks are throttled.
  const rl = rateLimit(`admin-campaigns:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  let body: CampaignReviewBody;
  try {
    body = (await request.json()) as CampaignReviewBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request — send a valid JSON body." },
      { status: 400 }
    );
  }
  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", body.campaignId ?? "")
    .single();
  if (campError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found." },
      { status: 404 }
    );
  }

  if (body.action === "approve") {
    // Approve guards: only a pending campaign with a payment
    // transaction ID may go live. Approving a live campaign would
    // restart its started_at/ends_at clock, approving a rejected
    // one would resurrect it, and approving without a transaction
    // ID would mark a campaign funded whose budget never arrived.
    if (campaign.status !== "pending") {
      return NextResponse.json(
        {
          error:
            campaign.status === "live"
              ? "This campaign is already live."
              : `This campaign has already been ${campaign.status} and cannot be approved.`,
        },
        { status: 400 }
      );
    }
    // 7-day expiry (migration 0030, tightened in 0038): an unpaid
    // pending campaign cannot be approved once it is 7+ days old.
    // A TxID on file no longer counts as paid — a campaign whose
    // TxID was submitted 7+ days ago and never verified has
    // expired too, and the message says so instead of claiming
    // it expired "after creation".
    const paymentTxId = String(
      (campaign as { payment_tx_id?: string | null }).payment_tx_id ?? ""
    ).trim();
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
          error: paymentTxId
            ? "This campaign expired with its payment still unverified — the Transaction ID was submitted more than 7 days ago and was never verified. It cannot be approved; ask the brand to create a new campaign and pay again."
            : "This campaign expired unpaid and cannot be approved — unpaid pending campaigns expire 7 days after they are created.",
        },
        { status: 400 }
      );
    }
    if (!paymentTxId) {
      return NextResponse.json(
        {
          error:
            "This campaign has no payment transaction ID — the brand's budget has not been confirmed. Do not approve until the payment proof is in.",
        },
        { status: 400 }
      );
    }
    // One real payment cannot "fund" two campaigns: the same
    // TxID on any OTHER campaign blocks approval. (No unique DB
    // constraint exists on payment_tx_id, so this is enforced
    // here and at payment time.) Case-insensitive — ilike,
    // because hex has no LIKE wildcards in it.
    const { data: txClash } = await supabase
      .from("campaigns")
      .select("id")
      .ilike("payment_tx_id", paymentTxId.toLowerCase())
      .neq("id", campaign.id)
      .limit(1);
    if (txClash && txClash.length > 0) {
      return NextResponse.json(
        {
          error:
            "This Transaction ID was already used on another campaign — one payment cannot fund two campaigns. Check the wallet before approving.",
        },
        { status: 400 }
      );
    }
    // Budget edited after payment: the TxID may verify a SMALLER
    // amount than the current budget, and approving would put the
    // campaign live underfunded. The ordering IS provable now:
    // payment_tx_submitted_at (migration 0038) is the payment
    // time, and every history row carries created_at — so only
    // edits AFTER the payment matter, and only an INCREASE matters.
    // The amount the TxID was sent against is the old_budget_total
    // of the earliest post-payment edit; a DECREASE after payment
    // means the brand OVERPAID, and approving is safe (the
    // overpaid difference is refunded on request — see the payment
    // page's overpayment banner). An edit made BEFORE the brand
    // paid trips nothing: the brand paid the new budget.
    const paymentSubmittedAt = String(
      (campaign as { payment_tx_submitted_at?: string | null })
        .payment_tx_submitted_at ?? ""
    ).trim();
    // (a legacy TxID row with no timestamp falls back to the
    // campaign's creation date — the same fallback the expiry
    // rule uses.)
    const paymentTimeRaw =
      paymentSubmittedAt ||
      (campaign as { created_at?: string | null }).created_at ||
      "";
    const paymentTimeMs = Number.isFinite(new Date(paymentTimeRaw).getTime())
      ? new Date(paymentTimeRaw).getTime()
      : 0;
    const { data: budgetEdits } = await supabase
      .from("campaign_budget_history")
      .select("created_at, old_budget_total, new_budget_total")
      .eq("campaign_id", campaign.id)
      .order("created_at", { ascending: true });
    const postPaymentEdits = (budgetEdits ?? []).filter(
      (row) =>
        new Date(
          (row as { created_at?: string }).created_at ?? ""
        ).getTime() > paymentTimeMs
    );
    const earliestPostPaymentEdit =
      postPaymentEdits[0] as
        | { created_at?: string; old_budget_total?: number }
        | undefined;
    const paidAgainst =
      earliestPostPaymentEdit != null
        ? Number(earliestPostPaymentEdit.old_budget_total ?? 0)
        : null;
    const budgetIncreasedAfterPayment =
      paidAgainst != null &&
      Number(campaign.budget_total ?? 0) > paidAgainst;
    const budgetEdited =
      Boolean(postPaymentEdits.length > 0) && budgetIncreasedAfterPayment;
    if (budgetEdited && !body.confirmUnderfunded) {
      return NextResponse.json(
        {
          error:
            "Budget was raised after this payment was submitted — verify the extra budget + 15% fee was received before approving.",
          underfundedRisk: true,
          latestBudgetEditAt:
            (
              postPaymentEdits[postPaymentEdits.length - 1] as
                | { created_at?: string }
                | undefined
            )?.created_at ?? null,
        },
        { status: 400 }
      );
    }
    // Approving starts the clock: the campaign runs from now until
    // its duration ends (no duration = until the budget ends) and
    // auto-ends when the duration finishes OR the budget hits 0.
    const startedAt = new Date();
    const durationDays = Number(
      (campaign as { duration_days?: number | null }).duration_days ?? 0
    );
    const endsAt =
      durationDays > 0
        ? new Date(startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000)
        : null;
    const patch: Record<string, unknown> = {
      status: "live",
      is_funded: true,
      started_at: startedAt.toISOString(),
    };
    if (endsAt) patch.ends_at = endsAt.toISOString();
    // P2-8: status-guarded flip — two concurrent approves both
    // pass the in-memory check above, but only one update matches
    // a still-pending row. Zero rows = the campaign was already
    // decided; the loser gets 409 instead of restarting the
    // started_at/ends_at clock (or resurrecting a rejection).
    const { data: approved, error } = await supabase
      .from("campaigns")
      .update(patch)
      .eq("id", campaign.id)
      .eq("status", "pending")
      .select("id");
    if (error && /started_at|ends_at/i.test(error.message)) {
      // started_at / ends_at come from migration 0009. The old
      // code retried WITHOUT them and reported success — the
      // campaign went live with no schedule, so a duration
      // campaign never ended by time and burn-rate math fell back
      // silently. Fail loudly instead: a campaign must never go
      // live without its schedule. All migrations 0001–0034 are
      // applied live, so missing columns mean something is
      // genuinely wrong.
      return NextResponse.json(
        {
          error:
            "Campaign schedule columns are missing (migration 0009) — the campaign was NOT approved. Run the missing migration in Supabase first.",
        },
        { status: 503 }
      );
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!approved || approved.length === 0) {
      return NextResponse.json(
        {
          error:
            "This campaign was already decided — reload /admin to see its current status.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({
      ok: true,
      message: "Campaign approved — now live on Discover.",
      ...(budgetEdited
        ? { budgetEditedAfterPayment: true }
        : {}),
    });
  }

  if (body.action === "reject") {
    if (campaign.status !== "pending") {
      return NextResponse.json(
        {
          error:
            campaign.status === "live"
              ? "This campaign is already live and cannot be rejected."
              : `This campaign has already been ${campaign.status}.`,
        },
        { status: 400 }
      );
    }
    // Reject REQUIRES a reason: a brand that already paid gets
    // rejected with no explanation otherwise. ≤200 chars, stored
    // in the brand chat thread (see file header) and returned so
    // the admin card can show it.
    const reason = String(body.reason ?? "").trim();
    if (!reason) {
      return NextResponse.json(
        { error: "Give a reason for rejecting this campaign." },
        { status: 400 }
      );
    }
    if (reason.length > 200) {
      return NextResponse.json(
        { error: "Rejection reason must be 200 characters or less." },
        { status: 400 }
      );
    }
    // P2-8: status-guarded flip, like the approve branch above —
    // a concurrent approve/reject race resolves to exactly one
    // winner; the loser gets 409 instead of the last write
    // winning silently.
    const { data: rejected, error } = await supabase
      .from("campaigns")
      .update({ status: "rejected" })
      .eq("id", campaign.id)
      .eq("status", "pending")
      .select("id");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!rejected || rejected.length === 0) {
      return NextResponse.json(
        {
          error:
            "This campaign was already decided — reload /admin to see its current status.",
        },
        { status: 409 }
      );
    }
    // Record the reason where the brand will see it: an admin
    // message in the campaign's brand chat thread (migration
    // 0015's owner-insert policy allows sender='admin'). If the
    // chat write fails, the rejection itself stands and the
    // reason is still in this response — but the admin is told
    // to pass it to the brand another way (e.g. Discord).
    let chatWarning: string | undefined;
    const { error: chatError } = await supabase
      .from("brand_messages")
      .insert({
        campaign_id: campaign.id,
        user_id: auth.user.id,
        message: `${CAMPAIGN_REJECTED_MESSAGE_PREFIX} ${reason}`,
        sender: "admin",
        message_type: "text",
        image_path: null,
        proof_url: null,
      });
    if (chatError) {
      console.error(
        "[admin/campaigns] rejection reason could not be posted to the brand chat:",
        chatError.message
      );
      chatWarning =
        "Rejection saved, but the reason could not be posted to the brand chat — tell the brand the reason on Discord.";
    }
    return NextResponse.json({
      ok: true,
      message: "Campaign rejected — it will never be shown.",
      rejectionReason: reason,
      ...(chatWarning ? { chatWarning } : {}),
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
