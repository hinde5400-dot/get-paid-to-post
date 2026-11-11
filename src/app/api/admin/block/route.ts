import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

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
  // Best-effort rate limit (see lib/rate-limit.ts): 10 blocks per
  // minute per admin, same pattern as the other admin POST routes.
  const rl = rateLimit(`admin-block:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  let body: { userId?: string };
  try {
    body = (await request.json()) as { userId?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request — send a valid JSON body." },
      { status: 400 }
    );
  }
  if (!body.userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  // The owner can never block himself — he plans to submit clips
  // as a creator, and a self-block would lock the owner out.
  if (body.userId === auth.user.id) {
    return NextResponse.json(
      { error: "You cannot block your own account." },
      { status: 400 }
    );
  }
  // A Supabase update matching zero rows returns NO error, so the
  // old code reported "Creator blocked" for a typo'd id that was
  // never blocked. Verify the user exists first.
  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", body.userId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const { error } = await supabase
    .from("users")
    .update({ is_blocked: true })
    .eq("id", body.userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    message:
      "Creator blocked. Blocked accounts cannot log in, submit, or withdraw.",
  });
}
