"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Submission } from "@/lib/types";
import { formatUSD } from "@/lib/money";
import { PLATFORM_LABELS } from "@/lib/constants";
import StatusBadge from "./StatusBadge";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

export interface AdminSubmission extends Submission {
  creator_email: string;
}

export default function AdminReviewList({
  submissions,
}: {
  submissions: AdminSubmission[];
}) {
  const router = useRouter();
  const [views, setViews] = useState<Record<string, string>>({});
  const [likes, setLikes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const { showError, showSuccess } = useToast();

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

  function review(
    s: AdminSubmission,
    action: "approve" | "reject" | "revoke"
  ) {
    const v = Number(views[s.id] ?? s.views ?? 0);
    const l = Number(likes[s.id] ?? s.likes ?? 0);
    if (action === "approve" && (!v || v <= 0)) {
      showError("Enter the verified views before approving.");
      return;
    }
    setBusyAction(action);
    void call(
      "/api/admin/review",
      { submissionId: s.id, action, views: v, likes: l },
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
      {submissions.map((s) => (
        <article
          key={s.id}
          className="rounded-2xl border border-fg/10 bg-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-lime">
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
              ⚠️ Duplicate of a post already submitted — auto-revoked.
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
                  className="mr-3 text-lime underline"
                >
                  screenshot
                </a>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-fg">
              Verified views
              <input
                type="number"
                min="0"
                value={views[s.id] ?? String(s.views ?? 0)}
                onChange={(e) =>
                  setViews((prev) => ({ ...prev, [s.id]: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-fg outline-none focus:border-lime"
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
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-fg outline-none focus:border-lime"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-fg/50">
            Current earnings: {formatUSD(s.earnings)} · Views:{" "}
            {s.views.toLocaleString()} · Likes: {s.likes.toLocaleString()}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => review(s, "approve")}
              disabled={busy === s.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-bold text-ink disabled:opacity-40"
            >
              {busy === s.id && busyAction === "approve" ? (
                <>
                  <Spinner /> Working…
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
                  <Spinner /> Working…
                </>
              ) : (
                "Reject"
              )}
            </button>
            <button
              onClick={() => review(s, "revoke")}
              disabled={busy === s.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-fg/20 px-4 py-2 text-sm font-bold text-fg disabled:opacity-40"
            >
              {busy === s.id && busyAction === "revoke" ? (
                <>
                  <Spinner /> Working…
                </>
              ) : (
                "Revoke"
              )}
            </button>
            <button
              onClick={() => blockCreator(s)}
              disabled={busy === `block-${s.user_id}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-red-500/50 px-4 py-2 text-sm font-bold text-red-300 disabled:opacity-40"
            >
              {busy === `block-${s.user_id}` && busyAction === "block" ? (
                <>
                  <Spinner /> Working…
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
