import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getServerClient } from "@/lib/supabase/server";
import { signInCronService } from "@/lib/supabase/cron-service";
import { refreshPendingViews } from "@/lib/views/refresh";

/**
 * GET /api/cron/refresh-views — the 3-hour view refresh job.
 *
 * Called by the GitHub Actions workflow (.github/workflows/
 * refresh-views.yml, free on a public repo) every 3 hours with
 * `Authorization: Bearer <CRON_SECRET>`. The route authenticates
 * with the shared secret AND signs in as the dedicated cron
 * service account (CRON_SERVICE_EMAIL / CRON_SERVICE_PASSWORD —
 * a normal creator-role user, not an admin) before any database
 * call, because migration 0036 revoked the anon grant on the
 * refresh RPCs. All database access goes through SECURITY DEFINER
 * functions (see migration 0018). No service_role key is used
 * anywhere.
 *
 * FAIL LOUD: when the service-account env vars are missing or the
 * sign-in fails, the route returns 503 immediately — a run must
 * never silently do nothing, and must never fall back to the anon
 * key for the revoked RPCs.
 *
 * STATUS (P1-11): 503 when the whole run failed (the pending list
 * could not be loaded at all, or every single row failed) — the
 * workflow only tests the status code, so a run that checked
 * nothing must not report 200. 200 with failed counts otherwise.
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
  // Migration 0036 revoked anon on the refresh RPCs — sign in as
  // the dedicated cron service account first. Fail loud (503) on
  // missing env vars or a failed sign-in; never fall back to anon.
  const serviceError = await signInCronService(supabase);
  if (serviceError) {
    console.error("Cron service sign-in failed:", serviceError);
    return NextResponse.json({ error: serviceError }, { status: 503 });
  }
  try {
    const summary = await refreshPendingViews(supabase);
    // P1-11: the whole run failed — every row failed (or nothing
    // could be checked) — so the workflow must see a non-200.
    // Partial failure stays 200 with the failed counts in the body.
    if (
      summary.checked > 0 &&
      summary.updated === 0 &&
      summary.skipped === 0 &&
      summary.failed >= summary.checked
    ) {
      return NextResponse.json(
        { ok: false, error: "View refresh failed for every row.", ...summary },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("View refresh failed:", err);
    return NextResponse.json(
      { error: "View refresh failed." },
      { status: 503 }
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
