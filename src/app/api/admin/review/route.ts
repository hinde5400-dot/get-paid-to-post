import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { holdUntil, payoutForViews } from "@/lib/money";
import { HOLD_HOURS } from "@/lib/constants";

interface ReviewBody {
  submissionId?: string;
  action?: "approve" | "reject";
  views?: number;
  likes?: number;
  /** Optional reason for a rejection (bot views, brief mismatch, ...). */
  reason?: string;
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
      return NextResponse.json({
        ok: true,
        message: "Submission rejected — its earnings were reversed.",
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
    return NextResponse.json({ ok: true, message: "Submission rejected." });
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
    if (!views || views <= 0) {
      return NextResponse.json(
        { error: "Enter the verified views before approving." },
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
    const ratePer1k = Number(campaign.rate_per_1m ?? 0) / 1000;
    const budgetLeft = Number(campaign.budget_left ?? 0);
    // The per-post cap (migration 0007) — a creator never earns more
    // than this on one post, even if the views would pay more. Older
    // campaigns fall back to the old per-video / earn-up-to value.
    const cap = Number(
      campaign.max_payout_per_post ??
        campaign.max_per_video ??
        campaign.earn_up_to ??
        300
    );
    const { uncapped, earnings: cappedEarnings, capped } = payoutForViews(
      views,
      ratePer1k,
      cap
    );
    // Never pay beyond the per-post cap or the remaining campaign budget.
    let earnings = Math.min(cappedEarnings, budgetLeft);
    earnings = Math.max(0, Math.round(earnings * 100) / 100);

    const hold = holdUntil(new Date());
    await supabase
      .from("submissions")
      .update({
        status: "approved",
        views,
        likes,
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
