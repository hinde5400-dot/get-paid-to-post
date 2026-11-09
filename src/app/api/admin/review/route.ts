import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { holdUntil, payoutForViews } from "@/lib/money";
import { HOLD_HOURS } from "@/lib/constants";
import { ratesFromRow, rateForPlatform } from "@/lib/types";
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

  const body = (await request.json()) as ReviewBody;
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
          const shortfall = Math.round((remaining - fromAvailable) * 100) / 100;
          await supabase
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
          if (shortfall > 0) {
            // Part of the earnings was already withdrawn — it cannot
            // be clawed back. Reject anyway and restore what is
            // possible; the shortfall is logged for the owner.
            console.error(
              `[admin/review] reject-after-approve shortfall: submission ${submission.id} earnings $${prevEarnings.toFixed(2)} could not be fully reversed — $${shortfall.toFixed(2)} already withdrawn/unrecoverable.`
            );
          }
        } else {
          console.error(
            `[admin/review] reject-after-approve shortfall: submission ${submission.id} earnings $${prevEarnings.toFixed(2)} could not be reversed — no wallet found for user ${submission.user_id}.`
          );
        }
        // Restore the campaign budget: the earnings go back into
        // budget_left and come off paid_out.
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("budget_left, paid_out")
          .eq("id", submission.campaign_id)
          .single();
        if (campaign) {
          await supabase
            .from("campaigns")
            .update({
              budget_left:
                Math.round(
                  (Number(campaign.budget_left ?? 0) + prevEarnings) * 100
                ) / 100,
              paid_out: Math.max(
                0,
                Math.round(
                  (Number(campaign.paid_out ?? 0) - prevEarnings) * 100
                ) / 100
              ),
            })
            .eq("id", submission.campaign_id);
        }
      }
      await supabase
        .from("submissions")
        .update({
          status: "rejected",
          earnings: 0,
          rejection_reason: reason,
        })
        .eq("id", submission.id);
      // P1-c: a 'bot views' rejection feeds the fraud ladder
      // (6 = concern, 10 = flag, 11 = auto-ban + owner alert).
      const fraud = await runBotRejectionCheck(supabase, submission.user_id, reason);
      return NextResponse.json({
        ok: true,
        message:
          "Submission rejected — its earnings were reversed." + fraud,
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
    await supabase
      .from("submissions")
      .update({ status: "rejected", rejection_reason: reason })
      .eq("id", submission.id);
    // P1-c: a 'bot views' rejection feeds the fraud ladder
    // (6 = concern, 10 = flag, 11 = auto-ban + owner alert).
    const fraud = await runBotRejectionCheck(supabase, submission.user_id, reason);
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
    const views = Math.max(0, Math.floor(Number(body.views ?? 0)));
    const likes = Math.max(0, Math.floor(Number(body.likes ?? 0)));
    const comments = Math.max(0, Math.floor(Number(body.comments ?? 0)));
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
    // Minimum views per clip (site-wide floor 1,000, migration 0028):
    // a clip below the campaign's minimum cannot be approved — the
    // owner must reject it instead.
    const minViews = Number(campaign.min_views ?? 1000);
    if (minViews > 0 && views < minViews) {
      return NextResponse.json(
        {
          error: `This clip has ${views.toLocaleString()} views, below the campaign's minimum of ${minViews.toLocaleString()} views per clip.`,
        },
        { status: 400 }
      );
    }
    // Per-platform rate (P1-b): the rate for THIS clip's platform
    // (rates[platform]), falling back to the campaign's legacy
    // single rate when no per-platform rate is set.
    const ratePer1k = rateForPlatform(
      {
        rates: ratesFromRow(campaign as Record<string, unknown>),
        view_bonus_per_1k: Number(campaign.rate_per_1m ?? 0) / 1000,
      },
      submission.platform
    );
    const budgetLeft = Number(campaign.budget_left ?? 0);
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

    // Per-creator $ cap (P1-b, migration 0025): when the brand set
    // one (max_payout_per_creator), approving is blocked when the
    // creator's APPROVED earnings on this campaign plus this clip's
    // earnings would exceed the cap. On top of the 15-approved-clips
    // count cap — this is the money cap.
    const creatorCap =
      campaign.max_payout_per_creator == null
        ? null
        : Number(campaign.max_payout_per_creator);
    if (creatorCap !== null && Number.isFinite(creatorCap)) {
      const { data: approvedRows } = await supabase
        .from("submissions")
        .select("earnings")
        .eq("campaign_id", campaign.id)
        .eq("user_id", submission.user_id)
        .eq("status", "approved");
      const creatorTotal = Math.round(
        ((approvedRows ?? []) as { earnings?: number }[]).reduce(
          (sum, r) => sum + Number(r.earnings ?? 0),
          0
        ) * 100
      ) / 100;
      if (creatorTotal + earnings > creatorCap) {
        return NextResponse.json(
          {
            error: `This creator has already earned $${creatorTotal.toFixed(2)} on this campaign, and approving this clip ($${earnings.toFixed(2)}) would exceed the campaign's maximum payout of $${creatorCap.toFixed(2)} per creator.`,
          },
          { status: 400 }
        );
      }
    }

    const hold = holdUntil(new Date());
    await supabase
      .from("submissions")
      .update({
        status: "approved",
        views,
        likes,
        comments,
        earnings,
        hold_until: hold.toISOString(),
      })
      .eq("id", submission.id);

    const { data: wallet } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", submission.user_id)
      .single();
    if (wallet) {
      await supabase
        .from("wallets")
        .update({
          pending_balance: Number(wallet.pending_balance ?? 0) + earnings,
        })
        .eq("user_id", submission.user_id);
    }
    await supabase
      .from("campaigns")
      .update({
        budget_left: Math.max(0, budgetLeft - earnings),
        spots_left: Math.max(0, Number(campaign.spots_left ?? 0) - 1),
        paid_out: Number(campaign.paid_out ?? 0) + earnings,
      })
      .eq("id", campaign.id);

    return NextResponse.json({
      ok: true,
      message: capped
        ? `Approved — $${earnings.toFixed(2)} credited to the creator's ${HOLD_HOURS}-hour hold. Cap of $${cap.toFixed(2)} applied: ${views.toLocaleString()} views at $${ratePer1k.toFixed(2)}/1k would have earned $${uncapped.toFixed(2)}.`
        : `Approved — $${earnings.toFixed(2)} credited to the creator's ${HOLD_HOURS}-hour hold.`,
      earnings,
      uncappedEarnings: uncapped,
      cap,
      capped,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
