import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/refunds — owner-only (Round-5 P1). Marks an
 * open refund request 'sent' after the owner has actually sent
 * the USDT refund by hand. Without this route a refund request
 * could never be closed: the queue never drained and the badge
 * never cleared.
 *
 * Auth mirrors the other admin POST routes: 401 when not logged
 * in, 403 when not the owner, 400 when the id is missing or the
 * request is not open, 404 when no such request exists, 503
 * when the refund_requests table is missing (migration 0041).
 * The row is only flipped when it is still 'requested' — a
 * second tap (or a request already marked 'sent' /
 * 'cancelled') reports 400 instead of silently re-marking it.
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
  // Best-effort rate limit (see lib/rate-limit.ts): 10 refund
  // marks per minute per admin, same pattern as the other admin
  // POST routes.
  const rl = rateLimit(`admin-refunds:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  let body: { refundId?: string; id?: string };
  try {
    body = (await request.json()) as { refundId?: string; id?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request — send a valid JSON body." },
      { status: 400 }
    );
  }
  const refundId = String(body.refundId ?? body.id ?? "").trim();
  if (!refundId) {
    return NextResponse.json(
      { error: "refundId is required." },
      { status: 400 }
    );
  }
  // A Supabase update matching zero rows returns NO error, so
  // verify the request exists and is still open first —
  // otherwise a typo'd id (or an already-closed request) reports
  // a successful mark that never happened.
  const { data: row, error } = await supabase
    .from("refund_requests")
    .select("id, status")
    .eq("id", refundId)
    .maybeSingle();
  if (error) {
    if (
      error.code === "42P01" ||
      /refund_requests/i.test(error.message ?? "") ||
      /relation .* does not exist/i.test(error.message ?? "")
    ) {
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
  if (!row) {
    return NextResponse.json(
      { error: "Refund request not found." },
      { status: 404 }
    );
  }
  if ((row as { status?: string }).status !== "requested") {
    return NextResponse.json(
      {
        error: `This refund request is already ${(row as { status?: string }).status ?? "closed"} — it cannot be marked sent again.`,
      },
      { status: 400 }
    );
  }
  const { data: updated, error: updateError } = await supabase
    .from("refund_requests")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", refundId)
    .eq("status", "requested")
    .select("id");
  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 }
    );
  }
  // The update matches zero rows (and returns no error) when the
  // request was closed between the read above and this write —
  // confirm a row actually flipped instead of reporting success.
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "This refund request is no longer open." },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    message: "Refund marked as sent.",
  });
}
