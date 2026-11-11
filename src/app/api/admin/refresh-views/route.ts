import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { refreshPendingViews } from "@/lib/views/refresh";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/refresh-views — owner-only manual view refresh.
 * Runs the same 3-hour refresh job on demand (the "Refresh views
 * now" button on /admin), so the owner never has to wait for the
 * next scheduled run before reviewing a submission.
 */
export const dynamic = "force-dynamic";

export async function POST() {
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
      { error: "View refresh is owner-only." },
      { status: 403 }
    );
  }
  // Best-effort rate limit (see lib/rate-limit.ts): 10 manual
  // refreshes per minute per admin, same pattern as the other
  // admin POST routes — a refresh is a long job, so rapid-fire
  // clicks are throttled.
  const rl = rateLimit(`admin-refresh-views:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  try {
    const summary = await refreshPendingViews(supabase);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("Manual view refresh failed:", err);
    return NextResponse.json(
      { error: "View refresh failed." },
      { status: 500 }
    );
  }
}
