// Admin — bio-code manual verification.
//
// GET → pending screenshots (verified_at null, proof_url set) plus
// every verified profile, so the admin can approve, reject, or
// unlock a locked profile. POST { id, action } with action
// "approve" (marks verified_by manual), "reject" (deletes a
// pending row so the creator starts over) or "unlock" (deletes a
// verified row so the creator can verify a different profile).
// Admin-only: getProfile(user.id)?.is_admin. RLS on
// verified_profiles has matching admin select/update/delete
// policies (migration 0046).
import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

async function requireAdmin() {
  const supabase = getServerClient();
  if (!supabase) return { error: "Supabase is not configured yet.", status: 503 as const };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Please log in first.", status: 401 as const };
  const profile = await getProfile(auth.user.id);
  if (!profile?.is_admin) {
    return { error: "Admin only.", status: 403 as const };
  }
  return { supabase };
}

type Row = {
  id: string;
  user_id: string;
  platform: string;
  profile_url: string;
  handle: string;
  channel_id: string | null;
  bio_code: string | null;
  code_expires_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  proof_url: string | null;
  created_at: string;
};

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { supabase } = gate;
  const { data, error } = await supabase
    .from("verified_profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Admin verify-profile list failed:", error);
    return NextResponse.json(
      { error: "Could not load verifications." },
      { status: 500 }
    );
  }
  const rows = (data ?? []) as Row[];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  let emails: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email")
      .in("id", userIds);
    for (const u of (users ?? []) as { id: string; email: string }[]) {
      emails[u.id] = u.email;
    }
  }
  const pending = rows
    .filter((r) => !r.verified_at && r.proof_url)
    .map((r) => ({ ...r, email: emails[r.user_id] ?? "" }));
  const verified = rows
    .filter((r) => r.verified_at)
    .map((r) => ({ ...r, email: emails[r.user_id] ?? "" }));
  return NextResponse.json({ pending, verified });
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const { supabase } = gate;

  let body: { id?: string; action?: string };
  try {
    body = (await request.json()) as { id?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  const action = body.action;
  if (!id || !["approve", "reject", "unlock"].includes(action ?? "")) {
    return NextResponse.json(
      { error: "Choose approve, reject or unlock." },
      { status: 400 }
    );
  }

  if (action === "approve") {
    const { error } = await supabase
      .from("verified_profiles")
      .update({
        verified_at: new Date().toISOString(),
        verified_by: "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      console.error("Admin verify-profile approve failed:", error);
      return NextResponse.json(
        { error: "Could not approve — please try again." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, action: "approve" });
  }

  // Reject (pending row) and unlock (verified row) both delete the
  // row — the creator starts over with a fresh code.
  const { error } = await supabase
    .from("verified_profiles")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("Admin verify-profile delete failed:", error);
    return NextResponse.json(
      { error: "Could not remove — please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, action });
}
