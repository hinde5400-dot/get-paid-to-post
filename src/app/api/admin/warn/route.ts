import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notify";

/**
 * Owner-only creator Warning (admin tabs, migration 0049:
 * creator_warnings + notifications).
 *
 * A warning is a record — who, why, when — NOT a ban. Bans
 * still go through the fraud ladder / block flow. The reason is
 * required (the UI disables the button until one is typed, and
 * this route 400s without one) and is stored on the row. The
 * creator is told via an in-app notification at warn time; the
 * notification insert is best-effort and never fails the warn
 * itself (a missing notifications table just means the creator
 * sees no notification yet — the warning is still recorded).
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
  const rl = rateLimit(`admin-warn:${auth.user.id}`, 10, 60_000);
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
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!userId) {
    return NextResponse.json(
      { error: "userId is required." },
      { status: 400 }
    );
  }
  if (!reason) {
    return NextResponse.json(
      { error: "A warning reason is required — it is recorded and shown to the creator." },
      { status: 400 }
    );
  }
  if (reason.length > 500) {
    return NextResponse.json(
      { error: "The warning reason must be 500 characters or less." },
      { status: 400 }
    );
  }

  const { data: target, error: targetError } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", userId)
    .single();
  if (targetError || !target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const { error: insertError } = await supabase
    .from("creator_warnings")
    .insert({
      user_id: userId,
      reason,
      created_by: auth.user.id,
    });
  if (insertError) {
    if (/creator_warnings/i.test(insertError.message)) {
      return NextResponse.json(
        {
          error:
            "Could not record the warning — run migration 0049 in Supabase first (it adds creator_warnings). The warning was NOT recorded.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 }
    );
  }

  // Tell the creator (best-effort — never fails the warn).
  await createNotification(supabase, {
    userId,
    type: "warning",
    title: "You received a warning from Get Paid To Post",
    message: `The admin warned your account: ${reason}`,
    link: "/dashboard",
  });

  return NextResponse.json({
    ok: true,
    message: `Warning recorded for ${String(target.email)}.`,
  });
}
