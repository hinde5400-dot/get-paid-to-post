import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getServerClient } from "@/lib/supabase/server";
import { refreshPendingViews } from "@/lib/views/refresh";

/**
 * GET /api/cron/refresh-views — the 3-hour view refresh job.
 *
 * Called by the GitHub Actions workflow (.github/workflows/
 * refresh-views.yml, free on a public repo) every 3 hours with
 * `Authorization: Bearer <CRON_SECRET>`. No user session is needed
 * — the route authenticates with the shared secret, and all
 * database access goes through SECURITY DEFINER functions (see
 * migration 0018). No service_role key is used anywhere.
 *
 * Why GitHub Actions and not Vercel Cron: the free Vercel Hobby
 * plan only allows cron jobs once a day, and Turn asked for every
 * 3 hours. GitHub Actions scheduled runs on a public repo are free.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function checkSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function handle(request: Request) {
  if (!checkSecret(request)) return unauthorized();
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }
  try {
    const summary = await refreshPendingViews(supabase);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("View refresh failed:", err);
    return NextResponse.json(
      { error: "View refresh failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
