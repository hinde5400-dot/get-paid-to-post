import { getServerClient } from "./supabase/server";

/**
 * Admin-only notes, flags & reminders (migration 0051).
 *
 * These tables are read ONLY from /admin (owner-only page) and
 * written ONLY through the /api/admin/notes + /api/admin/reminders
 * routes (both isOwner-gated). RLS also restricts them to the
 * admin (public.is_admin()). No brand or creator surface imports
 * this file — the notes, flags and reminders never leak to anyone
 * but Turn.
 *
 * Missing-table behaviour (migration not applied yet): the getters
 * return [] instead of throwing, so /admin renders the Notes tab
 * with a "not set up yet" line instead of breaking the whole page.
 * The API routes return a clear error in that case.
 */

export type AdminNoteTarget = "campaign" | "brand" | "creator";

export type AdminFlag = "watch" | "trusted" | "risky" | "vip";

export interface AdminNote {
  id: string;
  target_type: AdminNoteTarget;
  target_id: string;
  note: string;
  flag: AdminFlag | null;
  created_at: string;
}

export interface AdminReminder {
  id: string;
  title: string;
  body: string | null;
  due_date: string | null;
  done: boolean;
  created_at: string;
}

function isMissingTable(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  // PostgREST: "relation ... does not exist" (PGRST205) or
  // "Could not find the table ... in the schema cache".
  return (
    message.includes("does not exist") ||
    message.includes("PGRST205") ||
    message.includes("schema cache")
  );
}

export async function getAdminNotes(): Promise<AdminNote[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("admin_notes")
    .select("id, target_type, target_id, note, flag, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []) as AdminNote[];
}

export async function getAdminReminders(): Promise<AdminReminder[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("admin_reminders")
    .select("id, title, body, due_date, done, created_at")
    .order("done", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []) as AdminReminder[];
}
