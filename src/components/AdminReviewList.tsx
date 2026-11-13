"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Submission } from "@/lib/types";
import { formatUSD, payoutForViews } from "@/lib/money";
import { PLATFORM_LABELS, MAX_PAYOUT_DEFAULT } from "@/lib/constants";
import { engagementRate, formatEngagementRate } from "@/lib/engagement";
import { timeAgo } from "@/lib/time";
import StatusBadge from "./StatusBadge";
import VideoPreview from "./VideoPreview";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/** Fixed rejection reasons (P0 batch 3) — a fixed set so later
 *  fraud tooling can count them (e.g. how many "bot views"
 *  rejections a creator has). "other" takes a short free-text note,
 *  combined into the stored reason string.
 *
 *  The admin picks Turn's four labels (admin tabs): Fake Views,
 *  Low Quality, Wrong Hashtag, Copied Video. They map to the
 *  STORED values below — Fake Views stores as "bot views" so the
 *  fraud ladder keeps counting it (10 bot rejections = flag, one
 *  more = auto-ban); the others store as the closest existing
 *  values. The stored value is what the creator sees and what
 *  the fraud tooling counts — the label is only the admin's
 *  button text. */
export const REJECTION_REASONS = [
  "bot views",
  "brief mismatch",
  "wrong content",
  "duplicate",
  "other",
] as const;

/** Admin-facing label for each stored reason value. */
export const REJECTION_REASON_LABELS: Record<string, string> = {
  "bot views": "Fake Views",
  "brief mismatch": "Wrong Hashtag",
  "wrong content": "Low Quality",
  duplicate: "Copied Video",
  other: "Other",
};

/** Display label for a stored rejection reason (also handles
 *  "other: <note>" strings, which the creator sees as-is). */
export function displayRejectionReason(stored: string): string {
  if (stored.startsWith("other:")) {
    return `Other — ${stored.slice("other:".length).trim()}`;
  }
  return REJECTION_REASON_LABELS[stored] ?? stored;
}

/** One creator's history, for the review card (admin tabs):
 *  live counts from every submission, plus the fraud-ladder
 *  state — the only fraud score that exists (bot-rejection
 *  count + ladder status). No invented 0–100 score. */
export interface CreatorHistory {
  approved: number;
  rejected: number;
  botRejections: number;
  fraudStatus: string;
}

export interface AdminSubmission extends Submission {
  creator_email: string;
}

/**
 * Instagram handle that matched at submit time (migration 0039,
 * round-3 P2-17) — the admin hand-check anchors on this handle,
 * not the creator's current linked profile, which may have
 * changed since the clip was submitted.
 */
function instagramHandleMatched(s: Submission): string | null {
  const v = s.instagram_handle_matched;
  return typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null;
}

export default function AdminReviewList({
  submissions,
  /** Live bot-rejection count per creator (from /admin's Fraud
   *  data) — the only bot signal we actually have. There is NO
   *  third-party 0–100 bot score, so none is shown or invented. */
  botCounts = {},
  /** Active per-submission flags (migration 0031): a flagged
   *  payout is paused until the admin Approves, Rejects or
   *  Unflags it. */
  flags = {},
  /** Pagination: total submissions across ALL pages (from an
   *  exact count query) and the current page / page size. The
   *  list pages newest-first; without the total, submissions past
   *  the page would vanish silently. */
  total = null,
  page = 1,
  pageSize = 100,
  /** The inbox's current page, so Prev/Next links keep it instead
   *  of resetting the inbox to page 1. */
  otherPage = 1,
  /** Creators' linked Instagram profile URLs (users.instagram_url,
   *  pasted at onboarding) — for the Instagram hand-check below. */
  instagramUrls = {},
  /** Creator history per user id (admin tabs) — approved /
   *  rejected counts + fraud-ladder state, shown on each card. */
  creatorHistory = {},
  /** URL-encoded params the pagination links must keep
   *  (tab=review + the active search/filter), e.g.
   *  "tab=review&reviewStatus=pending&reviewSearch=x". */
  extraQuery = "",
  /** True when a search or status filter is active — the empty
   *  state then says "no match" instead of "no submissions yet". */
  searchActive = false,
}: {
  submissions: AdminSubmission[];
  botCounts?: Record<string, number>;
  flags?: Record<string, { reason: string; flagged_at: string }>;
  total?: number | null;
  page?: number;
  pageSize?: number;
  otherPage?: number;
  instagramUrls?: Record<string, string>;
  creatorHistory?: Record<string, CreatorHistory>;
  extraQuery?: string;
  searchActive?: boolean;
}) {
  const router = useRouter();
  const [views, setViews] = useState<Record<string, string>>({});
  const [likes, setLikes] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reasonNotes, setReasonNotes] = useState<Record<string, string>>({});
  // P1-C4: inline error when "other" is picked with no note — the
  // note is required for "other" (a bare "Rejected: other" tells
  // the creator nothing). Cleared as soon as a note is typed.
  const [otherNoteErrors, setOtherNoteErrors] = useState<
    Record<string, string>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [flagReasons, setFlagReasons] = useState<Record<string, string>>({});
  const [flagBusy, setFlagBusy] = useState<string | null>(null);
  // Bulk approve (admin tabs): checkboxes on pending cards +
  // one button that approves many at once via the existing
  // approve API, one call per clip. Clips whose posted time is
  // unverified are SKIPPED, never auto-overridden — they need
  // the hand-check, one by one.
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const { showError, showSuccess } = useToast();
  // Sort (admin batch 2): newest first by default, or by views,
  // or by bot signal (most bot rejections first) for fraud triage.
  const [sort, setSort] = useState<"newest" | "views" | "bot">("newest");
  const sorted = useMemo(() => {
    const arr = [...submissions];
    if (sort === "views") {
      arr.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    } else if (sort === "bot") {
      arr.sort(
        (a, b) =>
          (botCounts[b.user_id] ?? 0) - (botCounts[a.user_id] ?? 0) ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else {
      arr.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return arr;
  }, [submissions, sort, botCounts]);

  async function refreshViewsNow() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/refresh-views", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        checked?: number;
        updated?: number;
        skipped?: number;
        failed?: number;
      };
      if (!res.ok) throw new Error(data.error || "Refresh failed.");
      showSuccess(
        `Views refreshed — ${data.updated ?? 0} updated, ${data.skipped ?? 0} skipped, ${data.failed ?? 0} failed (checked ${data.checked ?? 0}).`
      );
      router.refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function call(
    url: string,
    body: Record<string, unknown>,
    id: string,
    okMsg: string
  ) {
    setBusy(id);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");
      showSuccess(data.message ?? okMsg);
      router.refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
      setBusyAction(null);
    }
  }

  /** Flag action (admin batch 2): pause this payout with a typed
   *  reason, or unflag it. NOT a rejection — nothing reverses.
   *  Approving / Rejecting a flagged submission from the card
   *  below resolves its flag automatically. */
  async function flagSubmission(s: AdminSubmission, action: "flag" | "unflag") {
    if (action === "flag" && !(flagReasons[s.id] ?? "").trim()) {
      showError("Give a reason for the flag.");
      return;
    }
    setFlagBusy(s.id);
    try {
      const res = await fetch("/api/admin/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: s.id,
          action,
          reason: (flagReasons[s.id] ?? "").trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        showError(data.error ?? "Could not flag this submission.");
        return;
      }
      showSuccess(data.message ?? "Done.");
      if (action === "flag") {
        setFlagReasons((prev) => ({ ...prev, [s.id]: "" }));
      }
      router.refresh();
    } catch {
      showError("Could not flag this submission.");
    } finally {
      setFlagBusy(null);
    }
  }

  async function review(
    s: AdminSubmission,
    action: "approve" | "reject"
  ) {
    const v = Number(views[s.id] ?? s.views ?? 0);
    const l = Number(likes[s.id] ?? s.likes ?? 0);
    const c = Number(comments[s.id] ?? s.comments ?? 0);
    if (action === "approve" && (!v || v <= 0)) {
      showError("Enter the verified views before approving.");
      return;
    }
    let reason: string | undefined;
    if (action === "reject") {
      const picked = reasons[s.id] ?? "";
      if (!picked) {
        showError("Pick a rejection reason before rejecting.");
        return;
      }
      const note = (reasonNotes[s.id] ?? "").trim();
      // P1-C4: "other" with no note is impossible — the stored
      // reason would read "other" to the creator, which explains
      // nothing. Block the submit (and the API 400s it too).
      if (picked === "other" && !note) {
        const message =
          "A short note is required when the reason is “other” — the creator sees the reason, so it has to say what was wrong.";
        setOtherNoteErrors((prev) => ({ ...prev, [s.id]: message }));
        showError(message);
        return;
      }
      reason = picked === "other" ? `other: ${note}` : picked;
    }
    // Round-3 P2-5: approve / reject-after-approve used to be
    // one-click — both move money, so both confirm first (same
    // window.confirm pattern as the override / block confirms).
    if (action === "approve") {
      // P2-A11: the server refuses below-minimum approves (400),
      // so the confirm must never promise a credit for one. Show
      // the minimum check instead of the credit amount.
      const minViews = Math.max(1000, s.campaign_min_views ?? 1000);
      if (v > 0 && v < minViews) {
        showError(
          `This clip has ${v.toLocaleString()} views, below the campaign minimum of ${minViews.toLocaleString()} views — below minimum, will be rejected by the server. Enter the verified views (at least ${minViews.toLocaleString()}) or reject the clip instead.`
        );
        return;
      }
      let est = 0;
      if (s.rate_per_1k != null && v > 0) {
        const calc = payoutForViews(
          v,
          s.rate_per_1k,
          s.max_payout_per_post ?? MAX_PAYOUT_DEFAULT
        );
        est = calc.earnings;
        if (
          s.campaign_budget_left != null &&
          est > s.campaign_budget_left
        ) {
          est = Math.max(0, s.campaign_budget_left);
        }
      }
      if (
        !window.confirm(
          `Approve this clip and credit ${formatUSD(est)} to the creator?`
        )
      ) {
        return;
      }
    }
    if (action === "reject" && s.status === "approved") {
      if (
        !window.confirm(
          `Reject this approved clip? This reverses ${formatUSD(s.earnings)} already credited to the creator.`
        )
      ) {
        return;
      }
    }
    const body: Record<string, unknown> = {
      submissionId: s.id,
      action,
      views: v,
      likes: l,
      comments: c,
      ...(reason ? { reason } : {}),
    };
    if (action === "approve") {
      // Unverified posted time: the API refuses the approve until
      // the admin confirms they checked the video's post time by
      // hand (30-minute rule). Ask once, then retry with the
      // override flag.
      setBusyAction(action);
      setBusy(s.id);
      try {
        let res = await fetch("/api/admin/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        let data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          message?: string;
          needsUnverifiedOverride?: boolean;
          legacyRateFallback?: boolean;
        };
        if (!res.ok && data.needsUnverifiedOverride) {
          if (
            !window.confirm(
              "This clip's posted time could not be verified — check the video's post time by hand (it must be within 30 minutes of posting) and confirm you checked it before approving."
            )
          ) {
            return;
          }
          res = await fetch("/api/admin/review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, overrideUnverified: true }),
          });
          data = (await res.json()) as {
            ok?: boolean;
            error?: string;
            message?: string;
            needsUnverifiedOverride?: boolean;
            legacyRateFallback?: boolean;
          };
        }
        if (!res.ok) throw new Error(data.error || "Action failed.");
        // P2-A1: the API flags legacyRateFallback when this clip
        // paid a fallback rate the creator never saw — surface it
        // in the toast, or the admin never learns the rate differed.
        showSuccess(
          (data.message ?? "Submission approved.") +
            (data.legacyRateFallback
              ? " Warning: this clip paid a fallback rate the creator never saw — fix the campaign's rate."
              : "")
        );
        router.refresh();
      } catch (e) {
        showError(e instanceof Error ? e.message : "Action failed.");
      } finally {
        setBusy(null);
        setBusyAction(null);
      }
      return;
    }
    setBusyAction(action);
    void call("/api/admin/review", body, s.id, `Submission ${action}d.`);
  }

  function blockCreator(s: AdminSubmission) {
    if (
      !window.confirm(
        `Block ${s.creator_email}? Blocked accounts cannot log in, submit, or withdraw.`
      )
    ) {
      return;
    }
    setBusyAction("block");
    void call(
      "/api/admin/block",
      { userId: s.user_id },
      `block-${s.user_id}`,
      "Creator blocked."
    );
  }

  /** Bulk approve (admin tabs): approve every selected pending
   *  clip, one existing-API call per clip, in order. No confirm
   *  dialogs (one per clip would be unusable) — but the same
   *  guards as a single approve apply: views must be entered,
   *  the 1,000-view minimum and the 1% engagement rule are
   *  enforced by the server, and a clip whose posted time is
   *  unverified is SKIPPED (counted, never auto-overridden) so
   *  the admin hand-checks it separately. The per-clip results
   *  are reported honestly — approved / skipped / failed — and
   *  a 429 (the review rate limit is 10 decisions per minute)
   *  stops the run with the remaining clips still selected. */
  async function bulkApprove() {
    const targets = sorted.filter(
      (s) => s.status === "pending" && selected[s.id]
    );
    if (targets.length === 0) return;
    if (
      !window.confirm(
        `Approve ${targets.length} clip${targets.length === 1 ? "" : "s"} at once? Each one is checked by the server (views, 1% engagement, 1,000-view minimum, budget). Clips whose posted time is unverified will be skipped — check those by hand.`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setBulkResult(null);
    let approved = 0;
    let skipped = 0;
    let failed = 0;
    let lastError = "";
    for (const s of targets) {
      const v = Number(views[s.id] ?? s.views ?? 0);
      const l = Number(likes[s.id] ?? s.likes ?? 0);
      const c = Number(comments[s.id] ?? s.comments ?? 0);
      if (!v || v <= 0) {
        failed++;
        lastError = `${s.submission_code || s.id.slice(0, 8)}: no verified views entered.`;
        continue;
      }
      try {
        const res = await fetch("/api/admin/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submissionId: s.id,
            action: "approve",
            views: v,
            likes: l,
            comments: c,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          needsUnverifiedOverride?: boolean;
        };
        if (!res.ok && data.needsUnverifiedOverride) {
          skipped++;
          continue;
        }
        if (!res.ok) {
          failed++;
          lastError = `${s.submission_code || s.id.slice(0, 8)}: ${data.error ?? "Action failed."}`;
          if (res.status === 429) break;
          continue;
        }
        approved++;
        setSelected((prev) => {
          const next = { ...prev };
          delete next[s.id];
          return next;
        });
      } catch {
        failed++;
        lastError = `${s.submission_code || s.id.slice(0, 8)}: request failed.`;
      }
    }
    setBulkBusy(false);
    const parts = [`Approved ${approved}`];
    if (skipped > 0) {
      parts.push(
        `${skipped} skipped — posted time unverified, check by hand`
      );
    }
    if (failed > 0) parts.push(`${failed} failed`);
    const summary = parts.join(" · ") + ".";
    setBulkResult(
      failed > 0 && lastError ? `${summary} Last failure: ${lastError}` : summary
    );
    if (approved > 0) showSuccess(summary);
    router.refresh();
  }

  const pendingOnPage = sorted.filter((s) => s.status === "pending");
  const selectedCount = pendingOnPage.filter((s) => selected[s.id]).length;
  const allSelected =
    pendingOnPage.length > 0 && selectedCount === pendingOnPage.length;

  if (submissions.length === 0) {
    return (
      <div className="rounded-2xl border border-fg/10 bg-card p-8 text-center">
        <p className="font-bold text-fg">
          {searchActive
            ? "No submissions match this search or filter"
            : "No submissions yet"}
        </p>
        <p className="mt-1 text-sm text-fg/60">
          {searchActive
            ? "Try a different username or status filter."
            : "Creator submissions will appear here for approval."}
        </p>
      </div>
    );
  }

  // Pagination footer: "Showing X–Y of Z" so the admin always
  // knows when older submissions live on another page.
  const totalCount = total ?? submissions.length;
  const showingFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, totalCount);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg/60">
          Views auto-refresh every 3 hours for pending clips (YouTube +
          TikTok). Instagram is not connected yet.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-bold text-fg">
            Sort:
            <select
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as "newest" | "views" | "bot")
              }
              className="rounded-full border border-fg/15 bg-card px-3 py-2 text-sm text-fg outline-none focus:border-red-500"
            >
              <option value="newest">Newest first</option>
              <option value="views">Most views</option>
              <option value="bot">Most bot rejections</option>
            </select>
          </label>
          <button
            type="button"
            onClick={refreshViewsNow}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/50 px-4 py-2 text-sm font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
          >
            {refreshing ? (
              <>
                <Spinner /> Refreshing...
              </>
            ) : (
              "Refresh views now"
            )}
          </button>
        </div>
      </div>
      {pendingOnPage.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-fg/10 bg-card px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-fg">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => {
                const checked = e.target.checked;
                setSelected((prev) => {
                  const next = { ...prev };
                  for (const s of pendingOnPage) {
                    if (checked) next[s.id] = true;
                    else delete next[s.id];
                  }
                  return next;
                });
              }}
              className="h-4 w-4 accent-red-500"
            />
            Select all pending on this page ({pendingOnPage.length})
          </label>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => void bulkApprove()}
              disabled={bulkBusy}
              className="rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-40"
            >
              {bulkBusy
                ? "Approving…"
                : `Approve selected (${selectedCount})`}
            </button>
          )}
          {bulkResult && (
            <p className="text-sm font-semibold text-fg/70">{bulkResult}</p>
          )}
        </div>
      )}
      {sorted.map((s) => (
        <article
          key={s.id}
          className="rounded-2xl border border-fg/10 bg-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {s.status === "pending" && (
                <input
                  type="checkbox"
                  checked={Boolean(selected[s.id])}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = { ...prev };
                      if (e.target.checked) next[s.id] = true;
                      else delete next[s.id];
                      return next;
                    })
                  }
                  aria-label={`Select ${s.submission_code || s.id.slice(0, 8)} for bulk approve`}
                  className="mt-1 h-4 w-4 shrink-0 accent-red-500"
                />
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-red-300">
                  {PLATFORM_LABELS[s.platform]} · {s.creator_email}
                </p>
                <h3 className="mt-1 font-bold text-fg">
                  {s.campaign_title ?? "Campaign"}
                </h3>
                <a
                  href={s.post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block max-w-md truncate text-sm text-fg/60 underline"
                >
                  {s.post_url}
                </a>
                <p className="mt-1 text-xs text-fg/50">
                  ID: <span className="font-mono text-fg">{s.submission_code || s.id.slice(0, 8)}</span>
                  {" · "}
                  {new Date(s.created_at).toLocaleString("en-US")} ·{" "}
                  {timeAgo(s.created_at)}
                </p>
                {/* Creator history (admin tabs): how many approved
                    / rejected, plus the fraud-ladder state — the
                    only fraud score that exists. */}
                {(() => {
                  const h = creatorHistory[s.user_id];
                  const approved = h?.approved ?? 0;
                  const rejected = h?.rejected ?? 0;
                  const fraud = h?.fraudStatus ?? "ok";
                  const botN = h?.botRejections ?? botCounts[s.user_id] ?? 0;
                  return (
                    <p className="mt-1 text-xs text-fg/60">
                      Creator history:{" "}
                      <span className="font-bold text-fg">
                        {approved} approved · {rejected} rejected
                      </span>{" "}
                      · Fraud:{" "}
                      <span
                        className={
                          fraud === "ok"
                            ? "font-bold text-fg"
                            : fraud === "concern"
                              ? "font-bold text-amber-300"
                              : "font-bold text-red-300"
                        }
                      >
                        {fraud === "ok"
                          ? `OK (${botN} bot rejection${botN === 1 ? "" : "s"})`
                          : `${fraud} (${botN} bot rejection${botN === 1 ? "" : "s"})`}
                      </span>
                    </p>
                  );
                })()}
              </div>
            </div>
            <StatusBadge status={s.status} />
          </div>

          {/* Video preview — plays INSIDE the panel (admin tabs):
              YouTube iframe, TikTok / Instagram official embeds,
              with a link fallback — never a broken box. */}
          <div className="mt-4">
            <VideoPreview url={s.post_url} platform={s.platform} />
          </div>

          {s.is_duplicate && (
            <p className="mt-3 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
              ⚠️ Duplicate of a post already submitted — auto-rejected.
            </p>
          )}

          <p className="mt-3 text-sm text-fg/70">
            <span className="font-bold text-fg">How they made it: </span>
            {s.how_made || "—"}
          </p>
          {s.proof_screenshots.length > 0 && (
            <div className="mt-2 text-sm">
              <span className="font-bold text-fg">Proof: </span>
              {s.proof_screenshots.map((p) => (
                <a
                  key={p}
                  href={p}
                  target="_blank"
                  rel="noreferrer"
                  className="mr-3 text-red-300 underline"
                >
                  screenshot
                </a>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-bold text-fg">
              Verified views
              <input
                type="number"
                min="0"
                value={views[s.id] ?? String(s.views ?? 0)}
                onChange={(e) =>
                  setViews((prev) => ({ ...prev, [s.id]: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-fg outline-none focus:border-red-500"
              />
            </label>
            <label className="block text-xs font-bold text-fg">
              Likes
              <input
                type="number"
                min="0"
                value={likes[s.id] ?? String(s.likes ?? 0)}
                onChange={(e) =>
                  setLikes((prev) => ({ ...prev, [s.id]: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-fg outline-none focus:border-red-500"
              />
            </label>
            <label className="block text-xs font-bold text-fg">
              Comments
              <input
                type="number"
                min="0"
                value={comments[s.id] ?? String(s.comments ?? 0)}
                onChange={(e) =>
                  setComments((prev) => ({
                    ...prev,
                    [s.id]: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-fg outline-none focus:border-red-500"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-fg/50">
            Current earnings: {formatUSD(s.earnings)} · Views:{" "}
            {s.views.toLocaleString()} · Likes: {s.likes.toLocaleString()}
            {" · "}Comments: {(s.comments ?? 0).toLocaleString()}
            {" · "}
            {(() => {
              const v = Number(views[s.id] ?? s.views ?? 0);
              const l = Number(likes[s.id] ?? s.likes ?? 0);
              const c = Number(comments[s.id] ?? s.comments ?? 0);
              const rate = engagementRate(l, c, v);
              if (rate === null) return "Engagement: — (no views yet)";
              const below = rate < 0.01;
              return (
                <>
                  Engagement:{" "}
                  <span
                    className={
                      below ? "font-bold text-red-300" : "font-bold text-fg"
                    }
                  >
                    {formatEngagementRate(rate)}
                  </span>
                  {below
                    ? " — below the 1% minimum, cannot approve (likes + comments only)"
                    : " — meets the 1% minimum"}
                </>
              );
            })()}
            {" · "}
            {s.views_refreshed_at
              ? `Auto-checked ${timeAgo(s.views_refreshed_at)}`
              : "Not auto-checked yet"}
          </p>

          {s.campaign_min_views != null && s.campaign_min_views > 0 ? (
            <p className="mt-2 text-xs font-bold text-fg/70">
              Campaign limits:{" "}
              {`min ${Math.max(s.campaign_min_views ?? 0, 1000).toLocaleString()} views per clip — below this, approve is blocked`}
              {" · "}
              Rate for this clip ({PLATFORM_LABELS[s.platform]}):{" "}
              {s.rate_per_1k !== undefined
                ? `${formatUSD(s.rate_per_1k)}/1k`
                : "—"}
            </p>
          ) : (
            <p className="mt-2 text-xs font-bold text-fg/70">
              Rate for this clip ({PLATFORM_LABELS[s.platform]}):{" "}
              {s.rate_per_1k !== undefined
                ? `${formatUSD(s.rate_per_1k)}/1k`
                : "—"}
            </p>
          )}

          {/* Review signals (admin batch 2, Content Rewards-style):
              estimated payout, bot signal from data we actually
              have, and the 30-minute-rule posted time. There is NO
              view curve — no view-history pipeline exists, and this
              batch does not build one. */}
          <div className="mt-2 space-y-1 text-xs text-fg/70">
            <p>
              {(() => {
                if (s.status !== "pending") return null;
                if (s.rate_per_1k == null) {
                  return (
                    <>
                      <span className="font-bold text-fg">Est. payout: </span>
                      — (no rate on this campaign)
                    </>
                  );
                }
                const v = Number(views[s.id] ?? s.views ?? 0);
                if (v <= 0) {
                  return (
                    <>
                      <span className="font-bold text-fg">Est. payout: </span>
                      $0.00 — enter verified views above
                    </>
                  );
                }
                const calc = payoutForViews(
                  v,
                  s.rate_per_1k,
                  s.max_payout_per_post ?? MAX_PAYOUT_DEFAULT
                );
                let est = calc.earnings;
                let note = "";
                if (calc.capped) {
                  note = ` (capped at ${formatUSD(s.max_payout_per_post ?? 0)} max per post)`;
                }
                if (
                  s.campaign_budget_left != null &&
                  est > s.campaign_budget_left
                ) {
                  est = Math.max(0, s.campaign_budget_left);
                  note = ` (limited by remaining budget ${formatUSD(s.campaign_budget_left)})`;
                }
                return (
                  <>
                    <span className="font-bold text-fg">Est. payout: </span>
                    {formatUSD(est)}{" "}
                    <span className="text-fg/50">
                      ({formatUSD(s.rate_per_1k)}/1k ×{" "}
                      {v.toLocaleString()} views
                      {s.max_payout_per_post != null
                        ? `, capped at ${formatUSD(s.max_payout_per_post)} per post`
                        : ""}
                      )
                    </span>
                    {note}
                  </>
                );
              })()}
            </p>
            <p>
              {(() => {
                const n = botCounts[s.user_id] ?? 0;
                if (n === 0) {
                  return (
                    <>
                      <span className="font-bold text-fg">Bot signal: </span>
                      <span className="text-fg/50">0 bot rejections</span>
                    </>
                  );
                }
                if (n < 6) {
                  return (
                    <>
                      <span className="font-bold text-fg">Bot signal: </span>
                      <span className="font-bold text-amber-300">
                        {n} bot rejection{n === 1 ? "" : "s"}
                      </span>
                    </>
                  );
                }
                return (
                  <>
                    <span className="font-bold text-fg">Bot signal: </span>
                    <span className="font-bold text-red-300">
                      {n} bot rejections — concern (10 = flag, one more
                      after the flag = auto-ban)
                    </span>
                  </>
                );
              })()}
            </p>
            {s.posted_time_unverified ? (
              <p className="font-semibold text-amber-300">
                ⚠ Posted time unverified — the platform API could not
                supply it. Check the video&apos;s post time before
                approving.
              </p>
            ) : s.posted_at ? (
              <p>
                <span className="font-bold text-fg">Posted: </span>
                {new Date(s.posted_at).toLocaleString("en-US")} · submitted{" "}
                {Math.max(
                  0,
                  Math.round(
                    (new Date(s.created_at).getTime() -
                      new Date(s.posted_at).getTime()) /
                      60000
                  )
                )}{" "}
                min after posting (30-minute limit)
              </p>
            ) : null}
          </div>

          {/* Instagram has no verifiable data: no API, no
              ownership gate, no posted time — the stored row says
              only "posted_time_unverified". Say so plainly, with
              the hand-check the admin must actually do and the
              creator's linked Instagram profile to check the
              author against. Round-3 P2-17: the handle that matched
              at submit time (migration 0039) is the anchor — check
              the Reel author against THAT, not the creator's
              current profile link, which may have changed since
              the submit. */}
          {s.platform === "instagram" && s.status === "pending" && (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200">
              <p className="font-bold">
                Instagram — posted time and ownership NOT verified
                automatically.
              </p>
              <p className="mt-1">
                Hand-check: open the Reel link, confirm the author
                matches the creator&apos;s linked Instagram profile
                and the post time is within 30 minutes.
              </p>
              {(() => {
                const matched = instagramHandleMatched(s);
                if (!matched) return null;
                return (
                  <p className="mt-1">
                    Matched at submit time:{" "}
                    <span className="font-bold">@{matched}</span> —
                    check the Reel author against this handle, not
                    the creator&apos;s current profile link below.
                  </p>
                );
              })()}
              {instagramUrls[s.user_id] ? (
                <p className="mt-1">
                  Linked Instagram profile:{" "}
                  <a
                    href={instagramUrls[s.user_id]}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-bold underline"
                  >
                    {instagramUrls[s.user_id]}
                  </a>
                </p>
              ) : (
                <p className="mt-1 font-semibold">
                  No Instagram profile link saved for this creator.
                </p>
              )}
            </div>
          )}

          {s.status === "rejected" && s.rejection_reason && (
            <p className="mt-3 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
              Rejected: {displayRejectionReason(s.rejection_reason)}
            </p>
          )}

          {/* Flag action (admin batch 2): a flagged payout is paused
              — not a rejection, nothing reverses. Appeal through
              Discord support if you think this flag was wrong;
              Approve / Reject / Unflag decides it. */}
          {s.status !== "rejected" &&
            (flags[s.id] ? (
              <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
                <p className="font-bold">
                  ⚑ Flagged — payout paused · {timeAgo(flags[s.id].flagged_at)}
                </p>
                <p className="mt-0.5">{flags[s.id].reason}</p>
                <p className="mt-0.5 text-xs text-amber-200/70">
                  If you think this flag was wrong, appeal through
                  Discord support. Approve, Reject or Unflag to
                  decide.
                </p>
                <button
                  type="button"
                  onClick={() => void flagSubmission(s, "unflag")}
                  disabled={flagBusy === s.id}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 px-4 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-500/10 disabled:opacity-40"
                >
                  {flagBusy === s.id ? (
                    <>
                      <Spinner /> Working...
                    </>
                  ) : (
                    "Unflag"
                  )}
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="text"
                  maxLength={200}
                  value={flagReasons[s.id] ?? ""}
                  onChange={(e) =>
                    setFlagReasons((prev) => ({
                      ...prev,
                      [s.id]: e.target.value,
                    }))
                  }
                  placeholder="Flag reason — e.g. views look bought, checking"
                  className="min-w-0 flex-1 rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-sm text-fg outline-none placeholder:text-fg/30 focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => void flagSubmission(s, "flag")}
                  disabled={flagBusy === s.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 px-4 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-500/10 disabled:opacity-40"
                >
                  {flagBusy === s.id ? (
                    <>
                      <Spinner /> Working...
                    </>
                  ) : (
                    "⚑ Flag"
                  )}
                </button>
              </div>
            ))}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-fg">
              Rejection reason (required to reject)
              <select
                value={reasons[s.id] ?? ""}
                onChange={(e) =>
                  setReasons((prev) => ({ ...prev, [s.id]: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-fg outline-none focus:border-red-500"
              >
                <option value="">Select a reason…</option>
                {REJECTION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {REJECTION_REASON_LABELS[r] ?? r}
                  </option>
                ))}
              </select>
            </label>
            {reasons[s.id] === "other" && (
              <label className="block text-xs font-bold text-fg">
                Short note (required for “other”)
                <input
                  type="text"
                  maxLength={120}
                  placeholder="e.g. wrong platform link"
                  value={reasonNotes[s.id] ?? ""}
                  onChange={(e) => {
                    setReasonNotes((prev) => ({
                      ...prev,
                      [s.id]: e.target.value,
                    }));
                    if (e.target.value.trim()) {
                      setOtherNoteErrors((prev) => {
                        if (!prev[s.id]) return prev;
                        const next = { ...prev };
                        delete next[s.id];
                        return next;
                      });
                    }
                  }}
                  className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-fg outline-none focus:border-red-500"
                />
                {otherNoteErrors[s.id] && (
                  <span className="mt-1 block text-xs font-semibold normal-case text-red-300">
                    {otherNoteErrors[s.id]}
                  </span>
                )}
              </label>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => review(s, "approve")}
              disabled={busy === s.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy === s.id && busyAction === "approve" ? (
                <>
                  <Spinner /> Loading...
                </>
              ) : (
                "Approve"
              )}
            </button>
            <button
              onClick={() => review(s, "reject")}
              disabled={
                busy === s.id ||
                (reasons[s.id] === "other" &&
                  !(reasonNotes[s.id] ?? "").trim())
              }
              title={
                reasons[s.id] === "other" &&
                !(reasonNotes[s.id] ?? "").trim()
                  ? "Add a short note first — “other” needs one."
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-4 py-2 text-sm font-bold text-red-300 disabled:opacity-40"
            >
              {busy === s.id && busyAction === "reject" ? (
                <>
                  <Spinner /> Loading...
                </>
              ) : (
                "Reject"
              )}
            </button>
            <button
              onClick={() => blockCreator(s)}
              disabled={busy === `block-${s.user_id}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-red-500/50 px-4 py-2 text-sm font-bold text-red-300 disabled:opacity-40"
            >
              {busy === `block-${s.user_id}` && busyAction === "block" ? (
                <>
                  <Spinner /> Loading...
                </>
              ) : (
                "Block creator"
              )}
            </button>
          </div>
        </article>
      ))}
      {/* Pagination: Prev / Next + "showing X of Y". Plain links
          (no router hooks) — the admin page reads reviewPage from
          the URL. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-fg/10 bg-card px-5 py-3">
        <p className="text-sm text-fg/60">
          Showing {showingFrom}–{showingTo} of {totalCount} submission
          {totalCount === 1 ? "" : "s"}
          {totalPages > 1 ? ` (page ${page} of ${totalPages})` : ""}
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <a
              href={`?${extraQuery ? `${extraQuery}&` : ""}reviewPage=${page - 1}${otherPage > 1 ? `&inboxPage=${otherPage}` : ""}`}
              className="rounded-full border border-fg/20 px-4 py-2 text-sm font-bold text-fg transition hover:border-red-500 hover:text-red-300"
            >
              ← Prev
            </a>
          ) : (
            <span className="cursor-not-allowed rounded-full border border-fg/10 px-4 py-2 text-sm font-bold text-fg/30">
              ← Prev
            </span>
          )}
          {page < totalPages ? (
            <a
              href={`?${extraQuery ? `${extraQuery}&` : ""}reviewPage=${page + 1}${otherPage > 1 ? `&inboxPage=${otherPage}` : ""}`}
              className="rounded-full border border-fg/20 px-4 py-2 text-sm font-bold text-fg transition hover:border-red-500 hover:text-red-300"
            >
              Next →
            </a>
          ) : (
            <span className="cursor-not-allowed rounded-full border border-fg/10 px-4 py-2 text-sm font-bold text-fg/30">
              Next →
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
