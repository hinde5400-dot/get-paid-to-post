import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { refreshPendingViews } from "@/lib/views/refresh";

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
