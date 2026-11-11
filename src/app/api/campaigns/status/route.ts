import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

/**
 * GET /api/campaigns/status?ids=<comma-separated campaign ids>
 * — lightweight campaign state for My Posts rows (P2-C3).
 * Submission carries no campaign status, so the list fetches it
 * here instead of joining the campaigns table on every row.
 * Authenticated only (any logged-in user — the ids are their own
 * submissions' campaigns, and only public campaign fields are
 * returned: status, title, ends_at, budget_left — never $ amounts
 * beyond the budget_left the creator's own review rows already
 * carry). Returns id → { status, title, ends_at, budget_left }.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
  const idsParam = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))].slice(
    0,
    100
  );
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, campaigns: {} });
  }
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, title, status, ends_at, budget_left")
    .in("id", ids);
  if (error) {
    return NextResponse.json(
      { error: "Could not load campaign status." },
      { status: 500 }
    );
  }
  const campaigns: Record<
    string,
    { status: string; title: string; ends_at: string | null; budget_left: number | null }
  > = {};
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const id = String(row.id ?? "");
    if (!id) continue;
    campaigns[id] = {
      status: String(row.status ?? ""),
      title: String(row.title ?? "Campaign"),
      ends_at: (row.ends_at as string | null) ?? null,
      budget_left:
        row.budget_left == null ? null : Number(row.budget_left),
    };
  }
  return NextResponse.json({ ok: true, campaigns });
}
