import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Owner-only admin reminders (migration 0051, Turn 2026-11-14).
 * Turn's own to-dos — visible ONLY on /admin, never to brands or
 * creators. RLS also restricts the table to the admin.
 *
 * POST   — create a reminder { title, body?, dueDate? (YYYY-MM-DD) }
 * PATCH  — mark done / not done { id, done }
 * DELETE — delete a reminder { id }
 */
async function requireOwner() {
  const supabase = getServerClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: "Supabase is not configured yet." },
        { status: 503 }
      ),
      supabase: null,
      userId: null,
    } as const;
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return {
      error: NextResponse.json(
        { error: "Please log in first." },
        { status: 401 }
      ),
      supabase: null,
      userId: null,
    } as const;
  }
  const profile = await getProfile(auth.user.id);
  if (!isOwner(profile)) {
    return {
      error: NextResponse.json(
        { error: "Admin reminders are owner-only." },
        { status: 403 }
      ),
      supabase: null,
      userId: null,
    } as const;
  }
  return { error: null, supabase, userId: auth.user.id } as const;
}

export async function POST(request: Request) {
  const { error, supabase, userId } = await requireOwner();
  if (error) return error;
  if (!supabase || !userId)
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  const rl = rateLimit(`admin-reminders:${userId}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  let body: { title?: string; body?: string; dueDate?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  const reminderBody = (body.body ?? "").trim() || null;
  const dueDate = (body.dueDate ?? "").trim() || null;
  if (!title) {
    return NextResponse.json(
      { error: "Write what to remember first." },
      { status: 400 }
    );
  }
  if (title.length > 200) {
    return NextResponse.json(
      { error: "Reminder must be 200 characters or less." },
      { status: 400 }
    );
  }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json(
      { error: "Due date must be a calendar date." },
      { status: 400 }
    );
  }
  const { data, error: dbError } = await supabase
    .from("admin_reminders")
    .insert({
      title,
      body: reminderBody,
      due_date: dueDate,
      created_by: userId,
    })
    .select("id, title, body, due_date, done, created_at")
    .single();
  if (dbError) {
    return NextResponse.json(
      {
        error:
          "Could not save the reminder — the reminders table may not be set up yet (migration 0051).",
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, reminder: data });
}

export async function PATCH(request: Request) {
  const { error, supabase, userId } = await requireOwner();
  if (error) return error;
  if (!supabase || !userId)
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  let body: { id?: string; done?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id || typeof body.done !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { error: dbError } = await supabase
    .from("admin_reminders")
    .update({ done: body.done })
    .eq("id", id);
  if (dbError) {
    return NextResponse.json(
      { error: "Could not update the reminder." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { error, supabase, userId } = await requireOwner();
  if (error) return error;
  if (!supabase || !userId)
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  let body: { id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) {
    return NextResponse.json(
      { error: "Missing reminder id." },
      { status: 400 }
    );
  }
  const { error: dbError } = await supabase
    .from("admin_reminders")
    .delete()
    .eq("id", id);
  if (dbError) {
    return NextResponse.json(
      { error: "Could not delete the reminder." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
