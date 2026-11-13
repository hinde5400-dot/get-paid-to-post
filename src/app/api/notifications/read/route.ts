import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Mark ALL of the logged-in user's notifications as read
 * (admin tabs, migration 0049). Any logged-in user, own rows
 * only — the RLS policy enforces that. A missing notifications
 * table (migration not run yet) is a no-op success: there is
 * nothing to mark read.
 */
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
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", auth.user.id)
      .eq("is_read", false);
    if (error) {
      // Missing table pre-migration — nothing to mark, not an
      // error the user can act on.
      if (/notifications/i.test(error.message)) {
        return NextResponse.json({ ok: true, marked: 0 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ ok: true, marked: 0 });
  }
  return NextResponse.json({ ok: true });
}
