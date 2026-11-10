"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Submission } from "@/lib/types";
import { formatUSD, payoutForViews } from "@/lib/money";
import { PLATFORM_LABELS, MAX_PAYOUT_DEFAULT } from "@/lib/constants";
import { engagementRate, formatEngagementRate } from "@/lib/engagement";
import StatusBadge from "./StatusBadge";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/** Fixed rejection reasons (P0 batch 3) — a fixed set so later
 *  fraud tooling can count them (e.g. how many "bot views"
 *  rejections a creator has). "other" takes a short free-text note,
 *  combined into the stored reason string. */
export const REJECTION_REASONS = [
  "bot views",
  "brief mismatch",
  "wrong content",
  "duplicate",
  "other",
] as const;

export interface AdminSubmission extends Submission {
  creator_email: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
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
}: {
  submissions: AdminSubmission[];
  botCounts?: Record<string, number>;
  flags?: Record<string, { reason: string; flagged_at: string }>;
}) {
  const router = useRouter();
  const [views, setViews] = useState<Record<string, string>>({});
  const [likes, setLikes] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reasonNotes, setReasonNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [flagReasons, setFlagReasons] = useState<Record<string, string>>({});
  const [flagBusy, setFlagBusy] = useState<string | null>(null);
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

  function review(
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
      // "other" with no note still stores the fixed "other" value —
      // that is what fraud tooling counts later.
      reason = picked === "other" && note ? `other: ${note}` : picked;
    }
    setBusyAction(action);
    void call(
      "/api/admin/review",
      {
        submissionId: s.id,
        action,
        views: v,
        likes: l,
        comments: c,
        ...(reason ? { reason } : {}),
      },
      s.id,
      `Submission ${action}d.`
    );
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

  if (submissions.length === 0) {
    return (
      <div className="rounded-2xl border border-fg/10 bg-card p-8 text-center">
        <p className="font-bold text-fg">No submissions yet</p>
        <p className="mt-1 text-sm text-fg/60">
          Creator submissions will appear here for approval.
        </p>
      </div>
    );
  }

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
      {sorted.map((s) => (
        <article
          key={s.id}
          className="rounded-2xl border border-fg/10 bg-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
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
                {new Date(s.created_at).toLocaleString("en-US")}
              </p>
            </div>
            <StatusBadge status={s.status} />
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
                    {formatUSD(est)}
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

          {s.status === "rejected" && s.rejection_reason && (
            <p className="mt-3 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
              Rejected: {s.rejection_reason}
            </p>
          )}

          {/* Flag action (admin batch 2): a flagged payout is paused
              — not a rejection, nothing reverses. One appeal per
              flag via Discord; Approve / Reject / Unflag decides it. */}
          {s.status !== "rejected" &&
            (flags[s.id] ? (
              <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
                <p className="font-bold">
                  ⚑ Flagged — payout paused · {timeAgo(flags[s.id].flagged_at)}
                </p>
                <p className="mt-0.5">{flags[s.id].reason}</p>
                <p className="mt-0.5 text-xs text-amber-200/70">
                  One appeal per flag via Discord. Approve, Reject or
                  Unflag to decide.
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
                    {r}
                  </option>
                ))}
              </select>
            </label>
            {reasons[s.id] === "other" && (
              <label className="block text-xs font-bold text-fg">
                Short note (optional)
                <input
                  type="text"
                  maxLength={120}
                  placeholder="e.g. wrong platform link"
                  value={reasonNotes[s.id] ?? ""}
                  onChange={(e) =>
                    setReasonNotes((prev) => ({
                      ...prev,
                      [s.id]: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-fg outline-none focus:border-red-500"
                />
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
              disabled={busy === s.id}
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
    </div>
  );
}
