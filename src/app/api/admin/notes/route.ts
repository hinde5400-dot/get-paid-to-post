import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import type { AdminFlag, AdminNoteTarget } from "@/lib/admin-notes";

const TARGETS: AdminNoteTarget[] = ["campaign", "brand", "creator"];
const FLAGS: AdminFlag[] = ["watch", "trusted", "risky", "vip"];

/**
 * Owner-only admin notes (migration 0051, Turn 2026-11-14).
 * Internal notes per campaign / brand / creator, with an optional
 * private flag — visible ONLY on /admin, never to brands or
 * creators. RLS also restricts the table to the admin.
 *
 * POST   — create a note { targetType, targetId, note, flag? }
 * DELETE — delete a note { id }
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
        { error: "Admin notes are owner-only." },
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
  const rl = rateLimit(`admin-notes:${userId}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  let body: {
    targetType?: string;
    targetId?: string;
    note?: string;
    flag?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const targetType = body.targetType;
  const targetId = (body.targetId ?? "").trim();
  const note = (body.note ?? "").trim();
  const flagRaw = (body.flag ?? null) as string | null;
  if (!targetType || !TARGETS.includes(targetType as AdminNoteTarget)) {
    return NextResponse.json(
      { error: "Pick what this note is about: a campaign, a brand or a creator." },
      { status: 400 }
    );
  }
  if (!targetId) {
    return NextResponse.json(
      { error: "Pick a campaign, brand or creator first." },
      { status: 400 }
    );
  }
  if (!note) {
    return NextResponse.json(
      { error: "Write the note first." },
      { status: 400 }
    );
  }
  if (note.length > 2000) {
    return NextResponse.json(
      { error: "Note must be 2,000 characters or less." },
      { status: 400 }
    );
  }
  const flag =
    flagRaw && FLAGS.includes(flagRaw as AdminFlag)
      ? (flagRaw as AdminFlag)
      : null;
  const { data, error: dbError } = await supabase
    .from("admin_notes")
    .insert({
      target_type: targetType,
      target_id: targetId,
      note,
      flag,
      created_by: userId,
    })
    .select("id, target_type, target_id, note, flag, created_at")
    .single();
  if (dbError) {
    return NextResponse.json(
      {
        error:
          "Could not save the note — the notes table may not be set up yet (migration 0051).",
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, note: data });
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
    return NextResponse.json({ error: "Missing note id." }, { status: 400 });
  }
  const { error: dbError } = await supabase
    .from("admin_notes")
    .delete()
    .eq("id", id);
  if (dbError) {
    return NextResponse.json(
      { error: "Could not delete the note." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
