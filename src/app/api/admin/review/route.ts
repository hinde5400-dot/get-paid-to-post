import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { holdUntil, payoutForViews } from "@/lib/money";
import { HOLD_HOURS } from "@/lib/constants";

interface ReviewBody {
  submissionId?: string;
  action?: "approve" | "reject" | "revoke";
  views?: number;
  likes?: number;
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

  if (body.action === "reject") {
    await supabase
      .from("submissions")
      .update({ status: "rejected" })
      .eq("id", submission.id);
    return NextResponse.json({ ok: true, message: "Submission rejected." });
  }

  if (body.action === "revoke") {
    // Reverse any hold credit, then zero the earnings.
    const prevEarnings = Number(submission.earnings ?? 0);
    if (prevEarnings > 0 && submission.status === "approved") {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", submission.user_id)
        .single();
      if (wallet) {
        const holdUntil = (submission as { hold_until?: string | null })
          .hold_until;
        const stillHeld =
          holdUntil && new Date(holdUntil).getTime() > Date.now();
        const field = stillHeld ? "pending_balance" : "available_balance";
        await supabase
          .from("wallets")
          .update({ [field]: Math.max(0, Number(wallet[field]) - prevEarnings) })
          .eq("user_id", submission.user_id);
      }
    }
    await supabase
      .from("submissions")
      .update({ status: "revoked", earnings: 0 })
      .eq("id", submission.id);
    return NextResponse.json({ ok: true, message: "Submission revoked." });
  }

  if (body.action === "approve") {
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
