import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

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
 *
 * Round-5 P1: unblocking now REQUIRES a reason (≤200 chars, the
 * same pattern as campaign reject / budget edit) — the decided
 * spec is "reason+confirm first", and until now nothing recorded
 * why a banned creator was let back in. The reason is stored on
 * creator_flags.unblock_reason (migration 0043); before 0043 is
 * applied the upsert is retried without the column, so the
 * unblock itself never fails for a missing column — the reason
 * is just not recorded, and the message says so.
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
  // Best-effort rate limit (see lib/rate-limit.ts): 10 unblocks per
  // minute per admin, same pattern as the other admin POST routes.
  const rl = rateLimit(`admin-unblock:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  let body: { userId?: string; reason?: string };
  try {
    body = (await request.json()) as { userId?: string; reason?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request — send a valid JSON body." },
      { status: 400 }
    );
  }
  if (!body.userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  // A reason is required — unblocking without one leaves no
  // record of why a banned creator was let back in.
  const reason = String(body.reason ?? "").trim();
  if (!reason) {
    return NextResponse.json(
      { error: "A reason is required to unblock a creator." },
      { status: 400 }
    );
  }
  if (reason.length > 200) {
    return NextResponse.json(
      { error: "The unblock reason must be 200 characters or less." },
      { status: 400 }
    );
  }
  // A Supabase update matching zero rows returns NO error, so
  // verify the user exists first — otherwise a typo'd id reports
  // a successful unblock that never happened.
  const { data: target } = await supabase
    .from("users")
    .select("id, is_blocked")
    .eq("id", body.userId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  // Round-6 A4: never reset the ladder of a creator who is not
  // blocked — the old code unconditionally cleared flagged_at /
  // banned_at, so unblocking a never-blocked creator sitting at
  // 9 bot rejections silently wiped their ladder. 409, the
  // already-decided status every other admin route uses.
  if ((target as { is_blocked?: boolean }).is_blocked !== true) {
    return NextResponse.json(
      { error: "Creator is not blocked." },
      { status: 409 }
    );
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
  const flagRow = {
    user_id: body.userId,
    flagged_at: null,
    banned_at: null,
    unblocked_at: new Date().toISOString(),
    unblock_reason: reason,
    updated_at: new Date().toISOString(),
  };
  let { error: flagError } = await supabase
    .from("creator_flags")
    .upsert(flagRow, { onConflict: "user_id" });
  if (
    flagError &&
    flagError.code === "42703" &&
    /unblock_reason/.test(flagError.message ?? "")
  ) {
    // Migration 0043 not applied yet — the column does not exist.
    // Retry the ladder reset without the reason so the unblock
    // itself still lands; the user is unblocked either way.
    const { unblock_reason: _dropped, ...flagRowLegacy } = flagRow;
    const retry = await supabase
      .from("creator_flags")
      .upsert(flagRowLegacy, { onConflict: "user_id" });
    if (!retry.error) {
      return NextResponse.json({
        ok: true,
        message:
          "Creator unblocked. Their bot-rejection count restarts from zero — earlier rejections stay visible as history but no longer count toward a re-ban. (The unblock reason could not be recorded — migration 0043 has not been applied yet.)",
      });
    }
    flagError = retry.error;
  }
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
