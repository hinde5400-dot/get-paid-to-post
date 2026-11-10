import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";

interface FlagBody {
  submissionId?: string;
  action?: "flag" | "unflag";
  reason?: string;
}

const MAX_REASON = 200;

/**
 * FLAG ACTION (admin batch 2, Content Rewards model, migration
 * 0031). Owner-only. Flagging PAUSES a payout — it is NOT a
 * rejection and reverses nothing: the submission keeps its
 * Pending / Approved / Rejected status, and an approved
 * submission's 72h hold cannot release while flagged (see
 * release_matured_holds). From flagged state the admin Approves,
 * Rejects (full reversal as today) or Unflags — deciding resolves
 * the flag automatically (see /api/admin/review). One appeal per
 * flag via Discord (process, not a column).
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
      { error: "Flagging is owner-only." },
      { status: 403 }
    );
  }

  const body = (await request.json()) as FlagBody;
  const { data: submission, error: subError } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("id", body.submissionId ?? "")
    .single();
  if (subError || !submission) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 }
    );
  }

  if (body.action === "flag") {
    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return NextResponse.json(
        { error: "Give a reason for the flag." },
        { status: 400 }
      );
    }
    if (reason.length > MAX_REASON) {
      return NextResponse.json(
        { error: `Flag reason is too long (max ${MAX_REASON} characters).` },
        { status: 400 }
      );
    }
    const { data: existing } = await supabase
      .from("submission_flags")
      .select("id")
      .eq("submission_id", submission.id)
      .is("resolved_at", null)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "This submission is already flagged." },
        { status: 400 }
      );
    }
    const { error } = await supabase.from("submission_flags").insert({
      submission_id: submission.id,
      flagged_by: auth.user.id,
      reason,
    });
    if (error) {
      if (error.code === "42P01" || /submission_flags/i.test(error.message)) {
        return NextResponse.json(
          {
            error:
              "Flagging is not set up yet — run migration 0031 in Supabase first.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Could not flag this submission." },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      message:
        "Flagged — payout paused until you decide. One appeal per flag via Discord.",
    });
  }

  if (body.action === "unflag") {
    const { data: updated, error } = await supabase
      .from("submission_flags")
      .update({
        resolved_at: new Date().toISOString(),
        resolved_action: "unflagged",
      })
      .eq("submission_id", submission.id)
      .is("resolved_at", null)
      .select("id");
    if (error) {
      return NextResponse.json(
        { error: "Could not unflag this submission." },
        { status: 400 }
      );
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: "This submission is not flagged." },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      message: "Unflagged — the payout is no longer paused.",
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
