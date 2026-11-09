"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminSubmission } from "./AdminReviewList";
import { REJECTION_REASONS } from "./AdminReviewList";
import { PLATFORM_LABELS } from "@/lib/constants";
import { engagementRate, formatEngagementRate } from "@/lib/engagement";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/**
 * Post-end re-check queue (P1-c, owner-only — renders on /admin).
 * Campaigns in their settlement window (ended but not yet
 * auto-deleted) with their APPROVED submissions: suspicious videos
 * get re-checked after the campaign ends — real ones stay, a
 * suspicious one is rejected even after the end.
 *
 * Reject here reuses POST /api/admin/review with the same reason
 * select as the main review list, so rejecting an already-approved
 * submission runs the same full reversal (wallet credit taken back
 * + campaign budget restored). No new reject path.
 */
export default function AdminRecheckList({
  submissions,
}: {
  submissions: AdminSubmission[];
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reasonNotes, setReasonNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function reject(s: AdminSubmission) {
    const picked = reasons[s.id] ?? "";
    if (!picked) {
      showError("Pick a rejection reason before rejecting.");
      return;
    }
    const note = (reasonNotes[s.id] ?? "").trim();
    const reason =
      picked === "other" && note ? `other: ${note}` : picked;
    setBusy(s.id);
    try {
      const res = await fetch("/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: s.id,
          action: "reject",
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reject failed.");
      showSuccess(data.message ?? "Submission rejected.");
      router.refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Reject failed.");
    } finally {
      setBusy(null);
    }
  }

  // Group by campaign so one ended campaign reads as one block.
  const byCampaign = new Map<string, AdminSubmission[]>();
  for (const s of submissions) {
    const key = s.campaign_title ?? s.campaign_id;
    const list = byCampaign.get(key) ?? [];
    list.push(s);
    byCampaign.set(key, list);
  }

  return (
    <div className="space-y-6">
      {[...byCampaign.entries()].map(([campaignTitle, rows]) => (
        <div key={campaignTitle}>
          <h3 className="font-bold text-fg">{campaignTitle}</h3>
          <p className="text-xs text-fg/50">
            {rows.length} approved clip{rows.length === 1 ? "" : "s"} to
            re-check
          </p>
          <div className="mt-3 space-y-4">
            {rows.map((s) => {
              const rate = engagementRate(s.likes, s.comments, s.views);
              const approvedAt = s.updated_at ?? s.hold_until ?? null;
              return (
                <article
                  key={s.id}
                  className="rounded-2xl border border-fg/10 bg-card p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-lime">
                        {PLATFORM_LABELS[s.platform]} · {s.creator_email}
                      </p>
                      <a
                        href={s.post_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block max-w-md truncate text-sm text-fg/60 underline"
                      >
                        {s.post_url}
                      </a>
                    </div>
                    <span className="rounded-full bg-lime/15 px-3 py-1 text-xs font-bold text-lime">
                      Approved
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-fg/70">
                    Views:{" "}
                    <span className="font-bold text-fg">
                      {s.views.toLocaleString()}
                    </span>
                    {" · "}Likes:{" "}
                    <span className="font-bold text-fg">
                      {s.likes.toLocaleString()}
                    </span>
                    {" · "}Comments:{" "}
                    <span className="font-bold text-fg">
                      {(s.comments ?? 0).toLocaleString()}
                    </span>
                    {" · "}Engagement:{" "}
                    {rate === null ? (
                      "— (no views yet)"
                    ) : (
                      <span
                        className={
                          rate < 0.01
                            ? "font-bold text-red-300"
                            : "font-bold text-lime"
                        }
                      >
                        {formatEngagementRate(rate)}
                        {rate < 0.01 ? " — below the 1% minimum" : ""}
                      </span>
                    )}
                    {" · "}Earned:{" "}
                    <span className="font-bold text-fg">
                      ${s.earnings.toFixed(2)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-fg/50">
                    Approved{" "}
                    {approvedAt
                      ? new Date(approvedAt).toLocaleString("en-US")
                      : "—"}
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-bold text-fg">
                      Rejection reason (required to reject)
                      <select
                        value={reasons[s.id] ?? ""}
                        onChange={(e) =>
                          setReasons((prev) => ({
                            ...prev,
                            [s.id]: e.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-fg outline-none focus:border-lime"
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
                          className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-fg outline-none focus:border-lime"
                        />
                      </label>
                    )}
                  </div>

                  <div className="mt-4">
                    <button
                      onClick={() => reject(s)}
                      disabled={busy === s.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-4 py-2 text-sm font-bold text-red-300 disabled:opacity-40"
                    >
                      {busy === s.id ? (
                        <>
                          <Spinner /> Loading...
                        </>
                      ) : (
                        "Reject (reverses earnings)"
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
