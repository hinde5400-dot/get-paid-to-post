import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getServerClient } from "@/lib/supabase/server";
import { signInCronService } from "@/lib/supabase/cron-service";

/**
 * GET/POST /api/cron/cleanup-ended-campaigns — the daily auto-delete
 * job for ended campaigns (P0 batch 4, Turn's decision 2026-11-09)
 * AND for unpaid pending campaigns that expired after 7 days
 * (item 13, Turn's decision 2026-11-10 — migration 0030).
 *
 * Called by the GitHub Actions workflow (.github/workflows/
 * cleanup-ended-campaigns.yml, free on a public repo) once a day
 * with `Authorization: Bearer <CRON_SECRET>`. The route
 * authenticates with the shared secret AND signs in as the
 * dedicated cron service account (CRON_SERVICE_EMAIL /
 * CRON_SERVICE_PASSWORD — a normal creator-role user, not an
 * admin) before any database or storage call, because migration
 * 0036 revoked the anon grant on the cleanup RPCs and on the
 * storage-policy predicate helpers. All database access goes
 * through SECURITY DEFINER functions (see migrations 0023 and
 * 0030). No service_role key is used anywhere.
 *
 * FAIL LOUD: when the service-account env vars are missing or the
 * sign-in fails, the route returns 503 immediately — a run must
 * never silently do nothing, and must never fall back to the anon
 * key for the revoked RPCs.
 *
 * What it deletes, per ended campaign: the campaign row, its
 * submissions, its brand_messages (chat), its proof images in
 * the private 'brand-proofs' bucket, and its logo + thumbnail in
 * the public 'campaign-images' bucket (migration 0032). Wallets
 * and withdrawals are NEVER deleted — money history stays forever.
 *
 * EXPIRED PENDING (migration 0030): a campaign that stays
 * status 'pending' with NO payment_tx_id for 7+ days is junk and
 * is removed the same way (messages, any submissions, proof
 * images, campaign row). Chat messages alone do NOT count as
 * payment — only payment_tx_id does. A pending campaign has no
 * submissions and no payouts, so nothing of value is lost.
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
 *   (d) PAYOUT COMPLETE — DECIDED (Turn, 2026-11-10): the gate is
 *       1 day after the last hold matures, NOT "after payout
 *       finishes". Per-campaign withdrawal linkage is impossible
 *       (withdrawals are not linked to campaigns in the schema),
 *       so "all earnings withdrawn" cannot be verified per
 *       campaign — there is no payout-finishes gate, and none is
 *       coming. Money is safe anyway: matured holds already sit
 *       in creators' available balances, and wallets/withdrawals
 *       are never deleted, so no money can be lost or stranded by
 *       deleting the campaign row.
 *   (e) SETTLEMENT TIMELINE: nothing is deleted earlier than 7
 *       days after the campaign ended (3-day re-check window +
 *       3-day/72h hold + 1-day buffer).
 *
 * ORDER MATTERS — database first, storage second (P2-11). The
 * old storage-first order could partially delete proof bytes and
 * then leave the campaign row in place on a storage error — the
 * proofs were gone while the campaign still lived. Now the
 * campaign DB row is deleted FIRST (the RPC re-checks eligibility
 * in the same transaction), and storage objects are removed
 * afterwards best-effort: a storage failure is logged and does
 * NOT fail the job, because the daily orphan sweep below cleans
 * up leftover objects. A campaign whose eligibility cannot be
 * determined is skipped, never failed and never deleted.
 *
 * Response: { ok, checked, deleted, skipped, failed, remaining,
 *   expired_pending_deleted, expired_pending_failed,
 *   expired_pending_remaining, expired_pending_error,
 *   orphan_images_deleted, orphan_proofs_deleted,
 *   orphan_files_remaining, details[] }
 * where details has one entry per candidate campaign (ended or
 * expired-pending), and `deleted` counts ended campaigns only —
 * expired pending deletions are counted separately in
 * `expired_pending_deleted` so the two jobs never blur together.
 *
 * STATUS (P1-11): 503 when the expired-pending lookup fails (a
 * whole half of the job did nothing) or when ALL candidates
 * failed — GitHub Actions only tests the status code, so a job
 * that deleted nothing must not report 200. 200 with counts
 * otherwise (partial failures are reported in the body).
 *
 * CHUNKING (Round-4 P2-A6): at most MAX_CANDIDATES_PER_RUN
 * ended campaigns and the same number of expired-pending ones
 * are processed per run, mirroring MAX_ROWS_PER_RUN = 60 in the
 * refresh job — the rest wait for the next daily run and are
 * reported as `remaining` / `expired_pending_remaining` in the
 * summary, so a large backlog no longer gets killed mid-run
 * inside the 60s invocation with no summary. The orphan sweep
 * below is capped the same way (MAX_ORPHAN_FILES_PER_RUN files
 * checked per bucket per run).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// P2-A6: per-run caps, mirroring the refresh job's
// MAX_ROWS_PER_RUN = 60 (src/lib/views/refresh.ts).
const MAX_CANDIDATES_PER_RUN = 60;
const MAX_ORPHAN_FILES_PER_RUN = 100;

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
  image_paths: string[] | null;
  eligible: boolean;
  skip_reason: string | null;
}

interface CleanupRow {
  deleted: boolean;
  reason: string | null;
  submissions_deleted: number;
  messages_deleted: number;
}

interface ExpiredPendingRow {
  campaign_id: string;
  title: string;
  created_at: string | null;
  messages_count: number;
  storage_paths: string[] | null;
  image_paths: string[] | null;
}

type Detail =
  | {
      campaign_id: string;
      result: "deleted";
      kind: "ended" | "expired_pending";
      submissions_deleted: number;
      messages_deleted: number;
      objects_deleted: number;
    }
  | {
      campaign_id: string;
      result: "skipped" | "failed";
      kind?: "ended" | "expired_pending";
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
  // Migration 0036 revoked anon on the cleanup RPCs and the
  // storage-policy predicate helpers — sign in as the dedicated
  // cron service account first. Fail loud (503) on missing env
  // vars or a failed sign-in; never fall back to anon.
  const serviceError = await signInCronService(supabase);
  if (serviceError) {
    console.error("Cron service sign-in failed:", serviceError);
    return NextResponse.json({ error: serviceError }, { status: 503 });
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

  // P2-A6: process only the first MAX_CANDIDATES_PER_RUN
  // candidates this run — the rest wait for the next daily run
  // and are reported as `remaining` below.
  const processedCandidates = candidates.slice(0, MAX_CANDIDATES_PER_RUN);
  const remaining = candidates.length - processedCandidates.length;

  const details: Detail[] = [];
  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of processedCandidates) {
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
      // 1) Database FIRST (P2-11): re-checks eligibility in the
      // same transaction, then deletes messages, submissions and
      // the campaign row. Wallets and withdrawals are never
      // touched. Only after the row is gone do we touch storage.
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

      // 2) Storage best-effort: remove the proof images through
      // the Storage API (the only path that frees the S3 bytes).
      // A failure here is logged and does NOT fail the job — the
      // campaign row is already gone, and the daily orphan sweep
      // cleans up leftovers. (The bucket policy gates removal to
      // eligible campaigns, so a post-delete removal may be
      // refused — that is exactly what the sweep is for.)
      let objectsDeleted = 0;
      const paths = candidate.storage_paths ?? [];
      if (paths.length > 0) {
        const { error: removeError } = await supabase.storage
          .from("brand-proofs")
          .remove(paths);
        if (removeError) {
          console.error(
            `Cleanup: storage removal failed for deleted campaign ${campaignId} (orphan sweep will retry):`,
            removeError.message
          );
        } else {
          objectsDeleted += paths.length;
        }
      }

      // 2b) Campaign images (migration 0032): logo + thumbnail in
      // the public 'campaign-images' bucket. Same best-effort rule.
      const imagePaths = candidate.image_paths ?? [];
      if (imagePaths.length > 0) {
        const { error: imageRemoveError } = await supabase.storage
          .from("campaign-images")
          .remove(imagePaths);
        if (imageRemoveError) {
          console.error(
            `Cleanup: campaign image removal failed for deleted campaign ${campaignId} (orphan sweep will retry):`,
            imageRemoveError.message
          );
        } else {
          objectsDeleted += imagePaths.length;
        }
      }

      deleted += 1;
      details.push({
        campaign_id: campaignId,
        result: "deleted",
        kind: "ended",
        submissions_deleted: result.submissions_deleted ?? 0,
        messages_deleted: result.messages_deleted ?? 0,
        objects_deleted: objectsDeleted,
      });
      console.log(
        `Cleanup: deleted campaign ${campaignId} — ` +
          `${result.submissions_deleted ?? 0} submissions, ` +
          `${result.messages_deleted ?? 0} messages, ` +
          `${objectsDeleted} objects removed ` +
          `(${paths.length + imagePaths.length} listed)`
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

  // --- Expired unpaid pending campaigns (migration 0030) ---
  // A campaign that stayed pending with no payment_tx_id for 7+
  // days is junk. Same DB-first order as above: delete the
  // database rows through the SECURITY DEFINER function (which
  // re-checks the predicate — a campaign that got paid or was
  // approved/rejected after the list step is never deleted), then
  // remove storage objects best-effort. A failure here must not
  // undo the ended-campaign work above, and if migration 0030 has
  // not been run yet the list call simply errors: that is a
  // whole-half failure, reported as 503 at the end (P1-11).
  let expiredPendingDeleted = 0;
  let expiredPendingFailed = 0;
  let expiredPendingTotal = 0;
  let expiredPendingError: string | null = null;
  let expiredPendingRemaining = 0;

  const { data: expiredRows, error: expiredListError } =
    await supabase.rpc("list_expired_pending_campaigns");
  if (expiredListError || !expiredRows) {
    expiredPendingError =
      "Expired-pending lookup failed (migration 0030 may not be run yet).";
    console.error("Cleanup expired-pending list failed:", expiredListError);
  } else {
    const expired = expiredRows as ExpiredPendingRow[];
    expiredPendingTotal = expired.length;
    // P2-A6: same per-run cap as the ended-campaign loop — the
    // rest wait for the next daily run.
    const processedExpired = expired.slice(0, MAX_CANDIDATES_PER_RUN);
    expiredPendingRemaining = expired.length - processedExpired.length;
    for (const row of processedExpired) {
      const campaignId = row.campaign_id;
      if (!campaignId) {
        expiredPendingFailed += 1;
        continue;
      }
      try {
        // 1) Database FIRST (P2-11) — same reason as above.
        const { data: cleaned, error: cleanupError } = await supabase.rpc(
          "cleanup_expired_pending_campaign",
          { p_campaign_id: campaignId }
        );
        if (cleanupError || !cleaned) {
          expiredPendingFailed += 1;
          details.push({
            campaign_id: campaignId,
            result: "failed",
            kind: "expired_pending",
            reason: cleanupError
              ? `database cleanup failed: ${cleanupError.message}`
              : "database cleanup returned nothing",
          });
          console.error(
            `Cleanup: database cleanup failed for expired pending campaign ${campaignId}:`,
            cleanupError
          );
          continue;
        }
        const result = (cleaned as CleanupRow[])[0];
        if (!result?.deleted) {
          // Paid, approved, or rejected between list and delete —
          // treat as a skip, not a failure.
          details.push({
            campaign_id: campaignId,
            result: "skipped",
            kind: "expired_pending",
            reason: result?.reason ?? "no longer expired pending",
          });
          console.log(
            `Cleanup: skipping expired pending campaign ${campaignId} — ${
              result?.reason ?? "no longer expired pending"
            }`
          );
          continue;
        }

        // 2) Storage best-effort (see ended-campaign loop).
        let objectsDeleted = 0;
        const paths = row.storage_paths ?? [];
        if (paths.length > 0) {
          const { error: removeError } = await supabase.storage
            .from("brand-proofs")
            .remove(paths);
          if (removeError) {
            console.error(
              `Cleanup: storage removal failed for deleted expired pending campaign ${campaignId} (orphan sweep will retry):`,
              removeError.message
            );
          } else {
            objectsDeleted += paths.length;
          }
        }
        const imagePaths = row.image_paths ?? [];
        if (imagePaths.length > 0) {
          const { error: imageRemoveError } = await supabase.storage
            .from("campaign-images")
            .remove(imagePaths);
          if (imageRemoveError) {
            console.error(
              `Cleanup: campaign image removal failed for deleted expired pending campaign ${campaignId} (orphan sweep will retry):`,
              imageRemoveError.message
            );
          } else {
            objectsDeleted += imagePaths.length;
          }
        }

        expiredPendingDeleted += 1;
        details.push({
          campaign_id: campaignId,
          result: "deleted",
          kind: "expired_pending",
          submissions_deleted: result.submissions_deleted ?? 0,
          messages_deleted: result.messages_deleted ?? 0,
          objects_deleted: objectsDeleted,
        });
        console.log(
          `Cleanup: deleted expired pending campaign ${campaignId} ("${row.title ?? ""}") — ` +
            `${result.submissions_deleted ?? 0} submissions, ` +
            `${result.messages_deleted ?? 0} messages, ` +
            `${objectsDeleted} objects removed ` +
            `(${paths.length + imagePaths.length} listed)`
        );
      } catch (err) {
        expiredPendingFailed += 1;
        details.push({
          campaign_id: campaignId,
          result: "failed",
          kind: "expired_pending",
          reason: err instanceof Error ? err.message : "unknown error",
        });
        console.error(
          `Cleanup: failed for expired pending campaign ${campaignId}:`,
          err
        );
      }
    }
  }

  // --- Orphaned campaign images (migration 0032) + brand proofs
  // (Round-4 P2-A9a) ---
  // A brand uploads its logo/thumbnail at confirmed submit and the
  // campaign POST follows at once — an upload only becomes an
  // orphan when that POST fails. Brand proofs become orphans the
  // same way: a storage removal that failed after the campaign
  // row was already deleted. Sweep both buckets once a day.
  //
  // campaign-images: list the bucket (objects live at
  // <user_id>/<uuid>.<ext>), ask the SECURITY DEFINER orphan
  // check per object (1+ day old and referenced by no campaign),
  // and remove the orphans through the Storage API.
  //
  // brand-proofs: there is NO orphan-check RPC for this bucket,
  // and the cron service account cannot reliably check whether a
  // campaign still exists (RLS shows it live campaigns only —
  // a pending campaign would look "gone"). The safety guard is
  // therefore the existing storage DELETE policies themselves
  // (migrations 0023/0030): a remove() is only allowed when the
  // file's campaign is cleanup-eligible or expired unpaid-pending,
  // so proofs of live, pending-paid, or recently-ended campaigns
  // are refused by the policy and this sweep can never delete
  // them. LIMIT: a leftover from an already-DELETED campaign is
  // refused by those same policies too (its campaign passes
  // neither predicate any more), so those orphans are still NOT
  // removed by this sweep — they need a future orphan-delete
  // policy migration. This sweep catches the ones whose campaign
  // row is still present and eligible.
  //
  // Best-effort, capped per run (P2-A6): at most
  // MAX_ORPHAN_FILES_PER_RUN old files are CHECKED per bucket per
  // run; the rest are reported as orphan_files_remaining. A
  // failure here never fails the job, and if migration 0032 has
  // not been run yet the calls simply error and are skipped.
  let orphanImagesDeleted = 0;
  let orphanProofsDeleted = 0;
  let orphanFilesRemaining = 0;
  async function sweepOrphans(
    bucket: "campaign-images" | "brand-proofs"
  ): Promise<{ deleted: number; remaining: number }> {
    let deleted = 0;
    let checked = 0;
    let remaining = 0;
    // TS narrowing of `supabase` (non-null after the guard above)
    // does not carry into this nested function — re-check here.
    const client = supabase;
    if (!client) return { deleted: 0, remaining: 0 };
    try {
      const { data: folders, error: foldersError } = await client.storage
        .from(bucket)
        .list("", { limit: 1000 });
      if (foldersError || !folders) return { deleted: 0, remaining: 0 };
      for (const folder of folders) {
        if (!folder.name) continue;
        const { data: files, error: filesError } = await client.storage
          .from(bucket)
          .list(folder.name, { limit: 1000 });
        if (filesError || !files) continue;
        const oldPaths = files
          .filter(
            (f) =>
              f.name &&
              f.created_at &&
              new Date(f.created_at).getTime() <
                Date.now() - 24 * 60 * 60 * 1000
          )
          .map((f) => `${folder.name}/${f.name}`);
        for (const path of oldPaths) {
          if (checked >= MAX_ORPHAN_FILES_PER_RUN) {
            remaining += 1;
            continue;
          }
          checked += 1;
          if (bucket === "campaign-images") {
            const { data: isOrphan } = await client.rpc(
              "campaign_image_is_orphan",
              { p_path: path }
            );
            if (isOrphan !== true) continue;
          }
          const { error: orphanRemoveError } = await client.storage
            .from(bucket)
            .remove([path]);
          if (!orphanRemoveError) deleted += 1;
        }
      }
    } catch (err) {
      console.error(`Cleanup: orphan sweep failed for ${bucket}:`, err);
    }
    return { deleted, remaining };
  }
  const imagesSweep = await sweepOrphans("campaign-images");
  orphanImagesDeleted = imagesSweep.deleted;
  const proofsSweep = await sweepOrphans("brand-proofs");
  orphanProofsDeleted = proofsSweep.deleted;
  orphanFilesRemaining = imagesSweep.remaining + proofsSweep.remaining;

  // P1-11: a job that did nothing must not report success — the
  // GitHub workflow only tests the status code. 503 when the
  // expired-pending lookup failed (a whole half of the job did
  // nothing) or when ALL candidates failed (every eligible ended
  // campaign, and every expired pending one, failed). Partial
  // failure stays 200 with the counts in the body. The "all
  // failed" checks count only what this run PROCESSED (P2-A6
  // cap) — unprocessed candidates waiting for the next run are
  // not failures.
  const processedEligibleEnded = processedCandidates.filter(
    (c) => c.eligible
  ).length;
  const allEndedFailed =
    processedEligibleEnded > 0 &&
    deleted === 0 &&
    failed >= processedEligibleEnded;
  const processedExpiredTotal =
    expiredPendingTotal - expiredPendingRemaining;
  const allExpiredFailed =
    processedExpiredTotal > 0 &&
    expiredPendingDeleted === 0 &&
    expiredPendingFailed >= processedExpiredTotal;
  const body = {
    ok: !expiredPendingError && !allEndedFailed && !allExpiredFailed,
    checked: candidates.length,
    deleted,
    skipped,
    failed,
    remaining,
    expired_pending_deleted: expiredPendingDeleted,
    expired_pending_failed: expiredPendingFailed,
    expired_pending_remaining: expiredPendingRemaining,
    expired_pending_error: expiredPendingError,
    orphan_images_deleted: orphanImagesDeleted,
    orphan_proofs_deleted: orphanProofsDeleted,
    orphan_files_remaining: orphanFilesRemaining,
    details,
  };
  if (expiredPendingError || allEndedFailed || allExpiredFailed) {
    return NextResponse.json(
      {
        ...body,
        error:
          expiredPendingError ??
          "All cleanup candidates failed — nothing was deleted.",
      },
      { status: 503 }
    );
  }
  return NextResponse.json(body);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
