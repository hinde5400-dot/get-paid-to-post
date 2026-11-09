import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getServerClient } from "@/lib/supabase/server";

/**
 * GET/POST /api/cron/cleanup-ended-campaigns — the daily auto-delete
 * job for ended campaigns (P0 batch 4, Turn's decision 2026-11-09).
 *
 * Called by the GitHub Actions workflow (.github/workflows/
 * cleanup-ended-campaigns.yml, free on a public repo) once a day
 * with `Authorization: Bearer <CRON_SECRET>`. No user session is
 * needed — the route authenticates with the shared secret, and all
 * database access goes through SECURITY DEFINER functions (see
 * migration 0023). No service_role key is used anywhere.
 *
 * What it deletes, per campaign: the campaign row, its submissions,
 * its brand_messages (chat), and its proof images in the private
 * 'brand-proofs' bucket. Wallets and withdrawals are NEVER deleted
 * — money history stays forever.
 *
 * SAFETY PREDICATE (single source of truth is
 * public.campaign_eligible_for_cleanup in migration 0023 — the
 * route only ever acts on rows that function marks eligible, and
 * the delete function re-checks it in the same transaction):
 *   (a) the campaign ENDED: funded, status 'live', but no longer
 *       live by isCampaignLive — budget_left <= 0 or ends_at passed.
 *       A campaign that never went live is never a candidate.
 *   (b) NO submissions with status 'pending' remain.
 *   (c) NO approved submission has an unknown hold (hold_until null).
 *   (d) PAYOUT COMPLETE — conservative operational definition
 *       (see migration 0023 header; confirm with Turn): every
 *       approved submission's 72h hold has matured AND at least 1
 *       day has passed since the LATEST hold_until. Withdrawals are
 *       not linked to campaigns in the schema, so per-campaign
 *       "all earnings withdrawn" cannot be verified exactly — but
 *       matured holds already sit in creators' available balances,
 *       and wallets/withdrawals are never deleted, so no money can
 *       be lost or stranded by deleting the campaign row.
 *   (e) SETTLEMENT TIMELINE: nothing is deleted earlier than 7
 *       days after the campaign ended (3-day re-check window +
 *       3-day/72h hold + 1-day buffer).
 *
 * ORDER MATTERS — storage first, database second. A SQL delete of
 * storage.objects would only remove the metadata and orphan the
 * file bytes in S3, so proof images are removed through the Storage
 * API (remove()), which deletes metadata AND bytes. That call is
 * gated by a storage policy that only permits deleting objects of
 * campaigns passing the same eligibility function. Only when every
 * listed object is removed does the route call the database delete;
 * if any storage removal fails, the campaign is left untouched and
 * retried on the next daily run. A campaign whose eligibility
 * cannot be determined is skipped, never failed and never deleted.
 *
 * Response: { ok, checked, deleted, skipped, failed, details[] }
 * where details has one entry per candidate campaign.
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

interface CandidateRow {
  campaign_id: string;
  title: string;
  ended_at: string | null;
  pending_count: number;
  approved_count: number;
  latest_hold_until: string | null;
  storage_paths: string[] | null;
  eligible: boolean;
  skip_reason: string | null;
}

interface CleanupRow {
  deleted: boolean;
  reason: string | null;
  submissions_deleted: number;
  messages_deleted: number;
}

type Detail =
  | {
      campaign_id: string;
      result: "deleted";
      submissions_deleted: number;
      messages_deleted: number;
      objects_deleted: number;
    }
  | {
      campaign_id: string;
      result: "skipped" | "failed";
      reason: string;
    };

async function handle(request: Request) {
  if (!checkSecret(request)) return unauthorized();
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }

  const { data: rows, error: listError } = await supabase.rpc(
    "list_cleanup_candidates"
  );
  if (listError || !rows) {
    console.error("Cleanup list failed:", listError);
    return NextResponse.json(
      {
        error:
          "Cleanup lookup failed (migration 0023 may not be run yet).",
      },
      { status: 503 }
    );
  }
  const candidates = rows as CandidateRow[];

  const details: Detail[] = [];
  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const campaignId = candidate.campaign_id;
    if (!campaignId) {
      // Eligibility cannot be determined for this row — skip it.
      skipped += 1;
      continue;
    }
    if (!candidate.eligible) {
      skipped += 1;
      details.push({
        campaign_id: campaignId,
        result: "skipped",
        reason: candidate.skip_reason ?? "not eligible",
      });
      console.log(
        `Cleanup: skipping campaign ${campaignId} — ${
          candidate.skip_reason ?? "not eligible"
        }`
      );
      continue;
    }

    try {
      // 1) Storage first: remove the proof images through the
      // Storage API (the only path that frees the S3 bytes). The
      // bucket policy only allows this for eligible campaigns.
      const paths = candidate.storage_paths ?? [];
      if (paths.length > 0) {
        const { error: removeError } = await supabase.storage
          .from("brand-proofs")
          .remove(paths);
        if (removeError) {
          failed += 1;
          details.push({
            campaign_id: campaignId,
            result: "failed",
            reason: `storage removal failed: ${removeError.message}`,
          });
          console.error(
            `Cleanup: storage removal failed for campaign ${campaignId}:`,
            removeError.message
          );
          // Leave the campaign (and its chat/submissions) untouched
          // so the next daily run can retry.
          continue;
        }
      }

      // 2) Database: re-checks eligibility in the same transaction,
      // then deletes messages, submissions and the campaign row.
      // Wallets and withdrawals are never touched.
      const { data: cleaned, error: cleanupError } = await supabase.rpc(
        "cleanup_ended_campaign",
        { p_campaign_id: campaignId }
      );
      if (cleanupError || !cleaned) {
        failed += 1;
        details.push({
          campaign_id: campaignId,
          result: "failed",
          reason: cleanupError
            ? `database cleanup failed: ${cleanupError.message}`
            : "database cleanup returned nothing",
        });
        console.error(
          `Cleanup: database cleanup failed for campaign ${campaignId}:`,
          cleanupError
        );
        continue;
      }
      const result = (cleaned as CleanupRow[])[0];
      if (!result?.deleted) {
        // Eligibility changed between list and delete — treat as a
        // skip, not a failure; the next run re-evaluates it.
        skipped += 1;
        details.push({
          campaign_id: campaignId,
          result: "skipped",
          reason: result?.reason ?? "no longer eligible",
        });
        console.log(
          `Cleanup: skipping campaign ${campaignId} — ${
            result?.reason ?? "no longer eligible"
          }`
        );
        continue;
      }

      deleted += 1;
      details.push({
        campaign_id: campaignId,
        result: "deleted",
        submissions_deleted: result.submissions_deleted ?? 0,
        messages_deleted: result.messages_deleted ?? 0,
        objects_deleted: paths.length,
      });
      console.log(
        `Cleanup: deleted campaign ${campaignId} — ` +
          `${result.submissions_deleted ?? 0} submissions, ` +
          `${result.messages_deleted ?? 0} messages, ` +
          `${paths.length} proof objects`
      );
    } catch (err) {
      failed += 1;
      details.push({
        campaign_id: campaignId,
        result: "failed",
        reason: err instanceof Error ? err.message : "unknown error",
      });
      console.error(`Cleanup: failed for campaign ${campaignId}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: candidates.length,
    deleted,
    skipped,
    failed,
    details,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
