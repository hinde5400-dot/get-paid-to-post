import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getServerClient } from "@/lib/supabase/server";

/**
 * GET/POST /api/cron/cleanup-ended-campaigns — the daily auto-delete
 * job for ended campaigns (P0 batch 4, Turn's decision 2026-11-09)
 * AND for unpaid pending campaigns that expired after 7 days
 * (item 13, Turn's decision 2026-11-10 — migration 0030).
 *
 * Called by the GitHub Actions workflow (.github/workflows/
 * cleanup-ended-campaigns.yml, free on a public repo) once a day
 * with `Authorization: Bearer <CRON_SECRET>`. No user session is
 * needed — the route authenticates with the shared secret, and all
 * database access goes through SECURITY DEFINER functions (see
 * migrations 0023 and 0030). No service_role key is used anywhere.
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
 * Response: { ok, checked, deleted, skipped, failed,
 *   expired_pending_deleted, expired_pending_failed,
 *   expired_pending_error, orphan_images_deleted, details[] }
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

  const { data: expiredRows, error: expiredListError } =
    await supabase.rpc("list_expired_pending_campaigns");
  if (expiredListError || !expiredRows) {
    expiredPendingError =
      "Expired-pending lookup failed (migration 0030 may not be run yet).";
    console.error("Cleanup expired-pending list failed:", expiredListError);
  } else {
    const expired = expiredRows as ExpiredPendingRow[];
    expiredPendingTotal = expired.length;
    for (const row of expired) {
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

  // --- Orphaned campaign images (migration 0032) ---
  // A brand uploads its logo/thumbnail at confirmed submit and the
  // campaign POST follows at once — an upload only becomes an
  // orphan when that POST fails. Sweep them once a day: list the
  // bucket (objects live at <user_id>/<uuid>.<ext>), ask the
  // SECURITY DEFINER orphan check per object (1+ day old and
  // referenced by no campaign), and remove the orphans through
  // the Storage API. Best-effort: a failure here never fails the
  // job, and if migration 0032 has not been run yet the calls
  // simply error and are skipped.
  let orphanImagesDeleted = 0;
  try {
    const { data: folders, error: foldersError } = await supabase.storage
      .from("campaign-images")
      .list("", { limit: 1000 });
    if (!foldersError && folders) {
      for (const folder of folders) {
        if (!folder.name) continue;
        const { data: files, error: filesError } = await supabase.storage
          .from("campaign-images")
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
          const { data: isOrphan } = await supabase.rpc(
            "campaign_image_is_orphan",
            { p_path: path }
          );
          if (isOrphan !== true) continue;
          const { error: orphanRemoveError } = await supabase.storage
            .from("campaign-images")
            .remove([path]);
          if (!orphanRemoveError) orphanImagesDeleted += 1;
        }
      }
    }
  } catch (err) {
    console.error("Cleanup: orphan image sweep failed:", err);
  }

  // P1-11: a job that did nothing must not report success — the
  // GitHub workflow only tests the status code. 503 when the
  // expired-pending lookup failed (a whole half of the job did
  // nothing) or when ALL candidates failed (every eligible ended
  // campaign, and every expired pending one, failed). Partial
  // failure stays 200 with the counts in the body.
  const eligibleEnded = candidates.filter((c) => c.eligible).length;
  const allEndedFailed =
    eligibleEnded > 0 && deleted === 0 && failed >= eligibleEnded;
  const allExpiredFailed =
    expiredPendingTotal > 0 &&
    expiredPendingDeleted === 0 &&
    expiredPendingFailed >= expiredPendingTotal;
  const body = {
    ok: !expiredPendingError && !allEndedFailed && !allExpiredFailed,
    checked: candidates.length,
    deleted,
    skipped,
    failed,
    expired_pending_deleted: expiredPendingDeleted,
    expired_pending_failed: expiredPendingFailed,
    expired_pending_error: expiredPendingError,
    orphan_images_deleted: orphanImagesDeleted,
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
