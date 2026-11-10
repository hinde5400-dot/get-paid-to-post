import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { holdUntil, payoutForViews } from "@/lib/money";
import { HOLD_HOURS, MAX_APPROVED_CLIPS_PER_PLATFORM } from "@/lib/constants";
import {
  BOT_REJECTION_REASON,
  handleBotRejection,
  type BotRejectionOutcome,
} from "@/lib/fraud";
import {
  MIN_ENGAGEMENT_RATE,
  engagementRate,
  formatEngagementRate,
} from "@/lib/engagement";

interface ReviewBody {
  submissionId?: string;
  action?: "approve" | "reject";
  views?: number;
  likes?: number;
  comments?: number;
  /** Optional reason for a rejection (bot views, brief mismatch, ...). */
  reason?: string;
  /**
   * Admin override for an unverified posted time: the clip's
   * posted time could not be verified (API failure / no
   * connection / Instagram hand-check pending). Approving such a
   * clip without this flag is refused — the admin must confirm
   * they checked the video's post time by hand first.
   */
  overrideUnverified?: boolean;
}

/**
 * P1-c fraud ladder: after a rejection is stored, a 'bot views'
 * reason counts toward the creator's ladder (6 = concern, 10 =
 * flag, 11 = auto-ban). Only the exact 'bot views' value counts.
 * Returns a short suffix for the response message when a
 * threshold was hit, so the owner sees it in the toast. Never
 * throws — handleBotRejection already swallows its own failures.
 */
async function runBotRejectionCheck(
  supabase: SupabaseClient,
  userId: string,
  reason: string | null
): Promise<string> {
  if (reason !== BOT_REJECTION_REASON) return "";
  const result: BotRejectionOutcome = await handleBotRejection(
    supabase,
    userId
  );
  if (result.outcome === "concern") {
    return ` Bot-view concern: this creator now has ${result.count} bot-view rejections.`;
  }
  if (result.outcome === "flagged") {
    return ` Creator flagged: ${result.count} bot-view rejections — one more bot rejection will auto-ban them.`;
  }
  if (result.outcome === "auto-banned") {
    return ` Creator auto-banned after ${result.count} bot-view rejections.`;
  }
  return "";
}

/**
 * Flag action (admin batch 2): deciding a flagged submission —
 * Approve or Reject — resolves its active flag, so the payout is
 * no longer paused. Best-effort and never throws: the table only
 * exists after migration 0031, and the review itself already
 * succeeded by the time this runs.
 */
async function resolveFlag(
  supabase: SupabaseClient,
  submissionId: string,
  action: "approved" | "rejected"
): Promise<void> {
  try {
    await supabase
      .from("submission_flags")
      .update({
        resolved_at: new Date().toISOString(),
        resolved_action: action,
      })
      .eq("submission_id", submissionId)
      .is("resolved_at", null);
  } catch {
    // Pre-migration 0031 or a transient DB error — the review
    // already succeeded; the flag just stays open for the admin
    // to unflag by hand.
  }
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
  if (!isOwner(profile)) {
    return NextResponse.json(
      { error: "Admin Review is owner-only." },
      { status: 403 }
    );
  }

  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }
  const { data: submission, error: subError } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", body.submissionId ?? "")
    .single();
  if (subError || !submission) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 }
    );
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : null;

  // Every rejection MUST show its reason — the creator sees it,
  // and the bot-view ladder counts on it. A rejection without a
  // reason is rejected here, before anything is stored.
  if (body.action === "reject" && !reason) {
    return NextResponse.json(
      {
        error:
          "A reason is required for every rejection — the creator sees it (for example bot views, brief mismatch, wrong content, duplicate).",
      },
      { status: 400 }
    );
  }

  if (body.action === "reject") {
    if (submission.status === "rejected") {
      return NextResponse.json(
        { error: "This submission has already been rejected." },
        { status: 400 }
      );
    }

    // Rejecting an APPROVED submission must fully reverse it: take
    // the earnings back out of the creator's wallet and restore the
    // campaign budget. (There is no revoke status any more — reject
    // is the only way back from approved.)
    if (submission.status === "approved") {
      const prevEarnings = Number(submission.earnings ?? 0);
      // Shortfall = money that could NOT be clawed back (already
      // withdrawn, or no wallet row). It goes into the response
      // message — the owner must never see a plain "reversed"
      // when part of it provably was not.
      let shortfall = 0;
      if (prevEarnings > 0) {
        // Release any matured 72h holds first, so the balances we
        // read are current (earnings may already have moved from
        // pending to available).
        try {
          await supabase.rpc("release_matured_holds");
        } catch {
          // Migration 0011 not run yet — balances are as stored.
        }
        const { data: wallet } = await supabase
          .from("wallets")
          .select("*")
          .eq("user_id", submission.user_id)
          .single();
        if (wallet) {
          const pending = Number(wallet.pending_balance ?? 0);
          const available = Number(wallet.available_balance ?? 0);
          // Take from the pending (held) balance first, then from
          // the available balance if the hold already matured.
          const fromPending = Math.min(pending, prevEarnings);
          const remaining = prevEarnings - fromPending;
          const fromAvailable = Math.min(available, remaining);
          shortfall = Math.round((remaining - fromAvailable) * 100) / 100;
          const { error: walletError } = await supabase
            .from("wallets")
            .update({
              pending_balance: Math.max(
                0,
                Math.round((pending - fromPending) * 100) / 100
              ),
              available_balance: Math.max(
                0,
                Math.round((available - fromAvailable) * 100) / 100
              ),
            })
            .eq("user_id", submission.user_id);
          if (walletError) {
            // The reversal did not happen — say so instead of
            // claiming success below.
            return NextResponse.json(
              {
                error: `Could not reverse the earnings from the creator's wallet (${walletError.message}). The clip was NOT rejected — try again or fix it in /admin.`,
              },
              { status: 500 }
            );
          }
          if (shortfall > 0) {
            // Part of the earnings was already withdrawn — it cannot
            // be clawed back. Reject anyway and restore what is
            // possible; the shortfall is logged and reported.
            console.error(
              `[admin/review] reject-after-approve shortfall: submission ${submission.id} earnings $${prevEarnings.toFixed(2)} could not be fully reversed — $${shortfall.toFixed(2)} already withdrawn/unrecoverable.`
            );
          }
        } else {
          // No wallet row at all — nothing could be clawed back.
          shortfall = prevEarnings;
          console.error(
            `[admin/review] reject-after-approve shortfall: submission ${submission.id} earnings $${prevEarnings.toFixed(2)} could not be reversed — no wallet found for user ${submission.user_id}.`
          );
        }
        // Restore the campaign budget — but ONLY what is actually
        // still in the system (P1-8). If the creator already
        // withdrew part of the earnings, that money has left and
        // restoring the full amount would let it be paid out a
        // second time to another creator. restorable = earnings
        // minus the shortfall; paid_out comes down by the same.
        const restorable =
          Math.round((prevEarnings - shortfall) * 100) / 100;
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("budget_left, paid_out")
          .eq("id", submission.campaign_id)
          .single();
        if (campaign && restorable > 0) {
          const { error: budgetError } = await supabase
            .from("campaigns")
            .update({
              budget_left:
                Math.round(
                  (Number(campaign.budget_left ?? 0) + restorable) * 100
                ) / 100,
              paid_out: Math.max(
                0,
                Math.round(
                  (Number(campaign.paid_out ?? 0) - restorable) * 100
                ) / 100
              ),
            })
            .eq("id", submission.campaign_id);
          if (budgetError) {
            return NextResponse.json(
              {
                error: `Could not restore the campaign budget (${budgetError.message}). The clip was NOT rejected — try again.`,
              },
              { status: 500 }
            );
          }
        }
      }
      const { error: rejectError } = await supabase
        .from("submissions")
        .update({
          status: "rejected",
          earnings: 0,
          rejection_reason: reason,
        })
        .eq("id", submission.id);
      if (rejectError) {
        return NextResponse.json(
          {
            error: `Could not reject the clip (${rejectError.message}). Nothing was changed — try again.`,
          },
          { status: 500 }
        );
      }
      // P1-c: a 'bot views' rejection feeds the fraud ladder
      // (6 = concern, 10 = flag, 11 = auto-ban + owner alert).
      const fraud = await runBotRejectionCheck(supabase, submission.user_id, reason);
      // Flag action: the decision resolves any active flag.
      await resolveFlag(supabase, submission.id, "rejected");
      return NextResponse.json({
        ok: true,
        message:
          shortfall > 0
            ? `Submission rejected — its earnings were reversed except $${shortfall.toFixed(2)} already withdrawn.` + fraud
            : "Submission rejected — its earnings were reversed." + fraud,
      });
    }

    // Pending (or any other non-approved, non-rejected) submission:
    // no money has moved yet, so there is nothing to reverse.
    if (submission.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot reject a submission with status "${submission.status}".` },
        { status: 400 }
      );
    }
    const { error: pendingRejectError } = await supabase
      .from("submissions")
      .update({ status: "rejected", rejection_reason: reason })
      .eq("id", submission.id);
    if (pendingRejectError) {
      return NextResponse.json(
        {
          error: `Could not reject the clip (${pendingRejectError.message}). Nothing was changed — try again.`,
        },
        { status: 500 }
      );
    }
    // P1-c: a 'bot views' rejection feeds the fraud ladder
    // (6 = concern, 10 = flag, 11 = auto-ban + owner alert).
    const fraud = await runBotRejectionCheck(supabase, submission.user_id, reason);
    // Flag action: the decision resolves any active flag.
    await resolveFlag(supabase, submission.id, "rejected");
    return NextResponse.json({
      ok: true,
      message: "Submission rejected." + fraud,
    });
  }

  if (body.action === "approve") {
    // Double-approve guard: approving an already-approved (or
    // rejected) submission would credit the wallet and decrement
    // the campaign budget a second time. Only pending may approve.
    if (submission.status !== "pending") {
      return NextResponse.json(
        {
          error:
            submission.status === "approved"
              ? "This submission has already been approved."
              : `This submission has already been ${submission.status} and cannot be approved.`,
        },
        { status: 400 }
      );
    }
    const viewsRaw = Number(body.views ?? 0);
    const likesRaw = Number(body.likes ?? 0);
    const commentsRaw = Number(body.comments ?? 0);
    // Non-finite numbers ("abc", Infinity) used to sail past the
    // guards: Math.max(0, NaN) is NaN, and NaN < 0.01 is false, so
    // a bogus likes count bypassed the 1% engagement gate.
    if (
      !Number.isFinite(viewsRaw) ||
      !Number.isFinite(likesRaw) ||
      !Number.isFinite(commentsRaw)
    ) {
      return NextResponse.json(
        { error: "Views, likes and comments must be numbers." },
        { status: 400 }
      );
    }
    const views = Math.max(0, Math.floor(viewsRaw));
    const likes = Math.max(0, Math.floor(likesRaw));
    const comments = Math.max(0, Math.floor(commentsRaw));
    if (!views || views <= 0) {
      return NextResponse.json(
        { error: "Enter the verified views before approving." },
        { status: 400 }
      );
    }
    // Minimum 1% engagement (likes + comments ONLY, never
    // shares/saves), at any view count. A clip whose likes +
    // comments are under 1% of its views cannot be approved —
    // the owner must reject it instead (with a reason).
    const rate = engagementRate(likes, comments, views);
    if (rate !== null && rate < MIN_ENGAGEMENT_RATE) {
      return NextResponse.json(
        {
          error: `Engagement ${formatEngagementRate(rate)} is below the 1% minimum (likes + comments only).`,
        },
        { status: 400 }
      );
    }
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", submission.campaign_id)
      .single();
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found." },
        { status: 404 }
      );
    }
    // Campaign-state check: never approve (and pay) out of a
    // campaign that never went live (pending = unfunded) or was
    // rejected. "live" and "ended" are both fine — pending clips
    // are still reviewed during the settlement window after a
    // campaign ends.
    if (campaign.status === "pending" || campaign.status === "rejected") {
      return NextResponse.json(
        {
          error: `This campaign is ${campaign.status} — clips can only be approved on a live (or ended) campaign.`,
        },
        { status: 400 }
      );
    }
    // Unverified posted time: the 30-minute rule could not be
    // checked (API failure, no connection, or Instagram — which
    // has no API yet). The admin must confirm they checked the
    // video's post time by hand before approving.
    if (
      (submission as Record<string, unknown>).posted_time_unverified === true &&
      body.overrideUnverified !== true
    ) {
      return NextResponse.json(
        {
          error:
            "This clip's posted time is unverified — check the video's post time by hand (30-minute rule) before approving, then confirm the override.",
          needsUnverifiedOverride: true,
        },
        { status: 400 }
      );
    }
    // Minimum views per clip (site-wide floor 1,000, migration 0028):
    // a clip below the campaign's minimum cannot be approved — the
    // owner must reject it instead. Clamped to >= 1,000: legacy
    // rows with min_views = 0 used to skip this check entirely
    // while the UI still showed "Min 1,000 views".
    const minViews = Math.max(1000, Number(campaign.min_views ?? 1000));
    if (minViews > 0 && views < minViews) {
      return NextResponse.json(
        {
          error: `This clip has ${views.toLocaleString()} views, below the campaign's minimum of ${minViews.toLocaleString()} views per clip.`,
        },
        { status: 400 }
      );
    }
    // SINGLE rate (P2-4): the campaign's view_bonus_per_1k is the
    // one source of truth — it is what every display (card, modal,
    // detail page, My Posts) shows the creator. The old code paid
    // from rate_per_1m / 1000, which diverges on any legacy row
    // or rounding drift, and on a row with rate_per_1m = 0 but a
    // set view_bonus_per_1k it failed with the misleading
    // "budget too small" error. Fall back to rate_per_1m / 1000
    // ONLY when view_bonus_per_1k is missing/0, and log it so a
    // legacy row gets fixed instead of silently paying the
    // fallback rate. There is no per-platform rate any more.
    const legacyRatePer1k = Number(campaign.rate_per_1m ?? 0) / 1000;
    let ratePer1k = Number(campaign.view_bonus_per_1k ?? 0);
    if (!Number.isFinite(ratePer1k) || ratePer1k <= 0) {
      ratePer1k = legacyRatePer1k;
      console.warn(
        `[admin/review] campaign ${campaign.id} has no view_bonus_per_1k — fell back to rate_per_1m/1000 ($${ratePer1k.toFixed(2)}/1k) for submission ${submission.id}.`
      );
    }
    if (!Number.isFinite(ratePer1k) || ratePer1k <= 0) {
      return NextResponse.json(
        {
          error:
            "This campaign has no pay rate set ($0 per 1k views) — set its rate before approving, or reject the clip.",
        },
        { status: 400 }
      );
    }
    const budgetLeft = Number(campaign.budget_left ?? 0);
    // A drained budget used to approve a clip at $0.00 with a
    // normal-looking "Approved — $0.00 credited" toast. Block it:
    // there is nothing left to pay this clip with.
    if (budgetLeft <= 0) {
      return NextResponse.json(
        {
          error:
            "This campaign's budget is fully used — there is nothing left to pay this clip with. Reject it, or top the budget up first.",
        },
        { status: 400 }
      );
    }
    // The per-post cap (migration 0007) — a creator never earns more
    // than this on one post, even if the views would pay more. Older
    // campaigns fall back to the old per-video / earn-up-to value.
    const cap = Number(
      campaign.max_payout_per_post ??
        campaign.max_per_video ??
        campaign.earn_up_to ??
        100
    );
    const { uncapped, earnings: cappedEarnings, capped } = payoutForViews(
      views,
      ratePer1k,
      cap
    );
    // Never pay beyond the per-post cap or the remaining campaign budget.
    let earnings = Math.min(cappedEarnings, budgetLeft);
    earnings = Math.max(0, Math.round(earnings * 100) / 100);
    // When the budget truncates the payout, say so — the creator
    // is paid less than the views earned, and that must be visible.
    const budgetCapped = earnings < cappedEarnings;
    if (earnings <= 0) {
      return NextResponse.json(
        {
          error:
            "The remaining budget is too small to pay this clip anything. Reject it, or top the budget up first.",
        },
        { status: 400 }
      );
    }

    // No per-creator $ cap (item 4, Turn's decision): a creator's
    // earnings across their clips depend on their views — the
    // `max_payout_per_creator` column is never enforced. The only
    // limits are the per-post cap above and the 15-approved-clips
    // per-platform count cap.

    // P1-3: approve-time backstop for the 15-approved-clips cap
    // (per campaign, per creator, per platform). Submit time
    // already checks it, but the pending backlog is uncapped, so
    // without this the owner could approve a 16th, 17th… clip
    // with no warning. Counted BEFORE the claim below; two
    // concurrent approves of the same creator/platform can still
    // both pass this read, so this is a backstop, not a lock.
    const { count: approvedCount, error: approvedCountError } =
      await supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", submission.campaign_id)
        .eq("user_id", submission.user_id)
        .eq("platform", submission.platform)
        .eq("status", "approved");
    if (approvedCountError) {
      return NextResponse.json(
        {
          error: `Could not check the approved-clips cap (${approvedCountError.message}). Nothing was changed — try again.`,
        },
        { status: 500 }
      );
    }
    if ((approvedCount ?? 0) >= MAX_APPROVED_CLIPS_PER_PLATFORM) {
      return NextResponse.json(
        {
          error: `This creator already has ${MAX_APPROVED_CLIPS_PER_PLATFORM} approved ${submission.platform} clips for this campaign — the limit is ${MAX_APPROVED_CLIPS_PER_PLATFORM} approved clips per platform per campaign.`,
        },
        { status: 400 }
      );
    }

    const hold = holdUntil(new Date());
    // Claim the submission FIRST, with a status guard: two
    // concurrent approves both pass the in-memory check above,
    // but only one update matches a still-pending row. Zero rows
    // updated = someone already decided it.
    const { data: claimed, error: claimError } = await supabase
      .from("submissions")
      .update({
        status: "approved",
        views,
        likes,
        comments,
        earnings,
        hold_until: hold.toISOString(),
      })
      .eq("id", submission.id)
      .eq("status", "pending")
      .select("id");
    if (claimError) {
      return NextResponse.json(
        {
          error: `Could not approve the clip (${claimError.message}). Nothing was changed — try again.`,
        },
        { status: 500 }
      );
    }
    if (!claimed || claimed.length === 0) {
      return NextResponse.json(
        {
          error:
            "This submission was already decided by another review — reload /admin to see its current status.",
        },
        { status: 409 }
      );
    }

    // P0-2: atomic budget decrement (migration 0036). The old
    // code read budget_left once and wrote an absolute value, so
    // two concurrent approves both read $100, each earned $80,
    // and the second write overwrote the first — $160 credited
    // against $80 of budget, paid_out undercounted forever. The
    // RPC decrements inside the database and refuses (ok: false)
    // when the remaining budget is too small or changed. Never
    // fall back to the absolute write — that IS the double-spend.
    const {
      data: budgetRows,
      error: budgetRpcError,
    } = await supabase.rpc("decrement_campaign_budget", {
      p_campaign_id: campaign.id,
      p_amount: earnings,
    });
    if (budgetRpcError) {
      // Function missing = migration 0036 not applied yet.
      // Abort the approval (revert the claim) — do NOT credit
      // the wallet and do NOT write the budget by hand.
      console.error(
        "[admin/review] decrement_campaign_budget RPC failed:",
        budgetRpcError.message
      );
      await supabase
        .from("submissions")
        .update({ status: "pending", earnings: 0, hold_until: null })
        .eq("id", submission.id)
        .eq("status", "approved");
      return NextResponse.json(
        {
          error:
            "Campaign budget could not be updated atomically — run migration 0036 in Supabase first, then retry. The approval was aborted and nothing was credited.",
        },
        { status: 500 }
      );
    }
    const budgetResult = (budgetRows as
      | { ok: boolean; new_budget_left: number; new_paid_out: number }[]
      | null)?.[0];
    if (!budgetResult?.ok) {
      // Budget too small or changed since the read above — abort
      // the approval (revert the claim) and credit nothing.
      await supabase
        .from("submissions")
        .update({ status: "pending", earnings: 0, hold_until: null })
        .eq("id", submission.id)
        .eq("status", "approved");
      return NextResponse.json(
        {
          error:
            "This campaign's budget is too small or changed while this review was open — nothing was credited. Reload /admin and try again.",
        },
        { status: 409 }
      );
    }
    const newBudgetLeft = Number(budgetResult.new_budget_left ?? 0);
    const { data: wallet } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", submission.user_id)
      .single();
    if (wallet) {
      const { error: walletError } = await supabase
        .from("wallets")
        .update({
          pending_balance: Number(wallet.pending_balance ?? 0) + earnings,
        })
        .eq("user_id", submission.user_id);
      if (walletError) {
        // The clip is approved but the credit failed — the owner
        // must know, because the toast below would otherwise claim
        // money was credited. The approved row stays visible in
        // /admin for a manual fix.
        return NextResponse.json(
          {
            error: `Clip approved, but the $${earnings.toFixed(2)} credit to the creator's wallet FAILED (${walletError.message}). The clip shows as approved in /admin — credit the wallet by hand.`,
          },
          { status: 500 }
        );
      }
    } else {
      // P2-5: no wallet row. The old code tried to INSERT one
      // here, but there is no wallets INSERT RLS policy anywhere,
      // so that insert could never succeed — dead code. It is
      // removed; wallets are created by the signup trigger, so a
      // missing row means the trigger missed this user. The clip
      // is approved and the budget already decremented below, so
      // the message tells the owner exactly what to do by hand.
      return NextResponse.json(
        {
          error: `Clip approved and the campaign budget was decremented, but no wallet exists for this creator and the site cannot create one (wallets are created by the signup trigger — this user missed it). Create the wallet row in Supabase (wallets table, user_id ${submission.user_id}, pending_balance $${earnings.toFixed(2)}, available_balance 0, withdrawn_total 0) to credit the $${earnings.toFixed(2)}.`,
        },
        { status: 500 }
      );
    }
    // spots_left is not money — it still moves with a plain
    // update (the RPC only owns budget_left/paid_out). A failure
    // here does not undo the credit; the owner is told plainly.
    const { error: spotsError } = await supabase
      .from("campaigns")
      .update({
        spots_left: Math.max(0, Number(campaign.spots_left ?? 0) - 1),
      })
      .eq("id", campaign.id);
    if (spotsError) {
      return NextResponse.json(
        {
          error: `Clip approved and credited, but the campaign's remaining-spots count could not be updated (${spotsError.message}). Fix the spots count in /admin — the clip paid $${earnings.toFixed(2)}.`,
        },
        { status: 500 }
      );
    }

    // Flag action: approving a flagged submission decides it —
    // the flag resolves and the payout proceeds.
    await resolveFlag(supabase, submission.id, "approved");

    const budgetNote = budgetCapped
      ? ` Capped by the remaining budget ($${newBudgetLeft.toFixed(2)} left) — the views earned $${cappedEarnings.toFixed(2)}.`
      : "";
    return NextResponse.json({
      ok: true,
      message: capped
        ? `Approved — $${earnings.toFixed(2)} credited to the creator's ${HOLD_HOURS}-hour hold. Cap of $${cap.toFixed(2)} applied: ${views.toLocaleString()} views at $${ratePer1k.toFixed(2)}/1k would have earned $${uncapped.toFixed(2)}.${budgetNote}`
        : `Approved — $${earnings.toFixed(2)} credited to the creator's ${HOLD_HOURS}-hour hold.${budgetNote}`,
      earnings,
      uncappedEarnings: uncapped,
      cap,
      capped,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
