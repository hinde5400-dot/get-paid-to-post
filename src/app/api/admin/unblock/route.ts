import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";

/**
 * POST /api/admin/unblock — owner-only. Lifts a block and resets
 * the bot-rejection ladder (migration 0027): users.is_blocked =
 * false, creator_flags.banned_at cleared, flagged_at cleared, and
 * unblocked_at stamped with now(). From then on, only bot
 * rejections AFTER unblocked_at count toward a re-ban
 * (src/lib/fraud.ts, getCreatorBotRejections); earlier rejections
 * stay in the submissions table as history.
 *
 * Auth mirrors POST /api/admin/block exactly: 401 when not logged
 * in, 403 when not the owner, 400 when userId is missing.
 *
 * Order: the users row is updated FIRST, and the ladder reset
 * only runs after it succeeds. The old order stamped the reset
 * first — if the unblock update then failed, the user stayed
 * blocked while their bot-ladder history was already wiped: a
 * half-applied unblock that looked like a failure.
 *
 * flagged_at is cleared too, not just banned_at: the ladder
 * restarts from zero, so the flag alert must be able to fire
 * again on a fresh climb to 10 — otherwise only the re-ban alert
 * would work after an unblock.
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
  const body = (await request.json()) as { userId?: string };
  if (!body.userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  // A Supabase update matching zero rows returns NO error, so
  // verify the user exists first — otherwise a typo'd id reports
  // a successful unblock that never happened.
  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", body.userId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const { data: unblocked, error } = await supabase
    .from("users")
    .update({ is_blocked: false })
    .eq("id", body.userId)
    .select("id");
  if (error || !unblocked || unblocked.length === 0) {
    return NextResponse.json(
      { error: error?.message ?? "Could not unblock this user." },
      { status: 400 }
    );
  }
  const { error: flagError } = await supabase
    .from("creator_flags")
    .upsert(
      {
        user_id: body.userId,
        flagged_at: null,
        banned_at: null,
        unblocked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (flagError) {
    // The user IS unblocked; only the ladder reset failed. Say so
    // plainly — the owner can re-run the unblock to retry the
    // reset, and the user is not stuck blocked.
    return NextResponse.json({
      ok: true,
      message: `Creator unblocked, but the bot-rejection ladder could not be reset (${flagError.message}). Re-run the unblock to retry the reset.`,
    });
  }
  return NextResponse.json({
    ok: true,
    message:
      "Creator unblocked. Their bot-rejection count restarts from zero — earlier rejections stay visible as history but no longer count toward a re-ban.",
  });
}
