"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOT_CONCERN_THRESHOLD,
  BOT_FLAG_THRESHOLD,
  FRAUD_STATUS_LABELS,
  type FraudStatus,
} from "@/lib/fraud";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/**
 * Admin fraud watch (P1-c, owner-only — this component only ever
 * renders on /admin). Bot-view rejections counted live from the
 * submissions table, per creator across all campaigns.
 *
 * Ladder: 6 = Concern, 10 = Flagged, one more bot rejection after
 * the flag = auto-banned (11). Creators never see this view.
 */
export interface FraudCreator {
  user_id: string;
  email: string;
  bot_rejections: number;
  status: FraudStatus;
  is_blocked: boolean;
  flagged_at: string | null;
  banned_at: string | null;
  latest: {
    campaign_id: string;
    campaign_title: string | null;
    post_url: string;
    created_at: string;
  } | null;
}

const STATUS_STYLES: Record<FraudStatus, string> = {
  ok: "bg-lime/15 text-lime",
  concern: "bg-yellow-500/15 text-yellow-300",
  flagged: "bg-orange-500/15 text-orange-300",
  banned: "bg-red-500/15 text-red-300",
};

export default function AdminFraudList({
  creators,
}: {
  creators: FraudCreator[];
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function blockCreator(c: FraudCreator) {
    if (
      !window.confirm(
        `Block ${c.email}? Blocked accounts cannot log in, submit, or withdraw.`
      )
    ) {
      return;
    }
    setBusy(c.user_id);
    try {
      const res = await fetch("/api/admin/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: c.user_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Block failed.");
      showSuccess(data.message ?? "Creator blocked.");
      router.refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Block failed.");
    } finally {
      setBusy(null);
    }
  }

  if (creators.length === 0) {
    return (
      <div className="rounded-2xl border border-fg/10 bg-card p-8 text-center">
        <p className="font-bold text-fg">No bot-view rejections yet</p>
        <p className="mt-1 text-sm text-fg/60">
          Creators with bot-view rejections will appear here —{" "}
          {BOT_CONCERN_THRESHOLD} is a concern, {BOT_FLAG_THRESHOLD} is a
          flag, and one more bot rejection after the flag auto-bans them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {creators.map((c) => (
        <article
          key={c.user_id}
          className="rounded-2xl border border-fg/10 bg-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold text-fg">{c.email}</p>
              <p className="mt-1 text-sm text-fg/60">
                <span className="font-bold text-fg">
                  {c.bot_rejections} bot-view rejection
                  {c.bot_rejections === 1 ? "" : "s"}
                </span>
                {c.status === "concern" &&
                  ` — concern (${BOT_CONCERN_THRESHOLD}+). Watch their next submissions.`}
                {c.status === "flagged" &&
                  ` — flagged (${BOT_FLAG_THRESHOLD}). One more bot rejection will auto-ban them.`}
                {c.status === "banned" &&
                  " — auto-banned after 11 bot-view rejections."}
              </p>
              {c.flagged_at && (
                <p className="mt-1 text-xs text-fg/50">
                  Flagged{" "}
                  {new Date(c.flagged_at).toLocaleString("en-US")}
                  {c.banned_at &&
                    ` · Banned ${new Date(c.banned_at).toLocaleString("en-US")}`}
                </p>
              )}
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[c.status]}`}
            >
              {FRAUD_STATUS_LABELS[c.status]}
            </span>
          </div>

          {c.latest && (
            <p className="mt-3 text-sm text-fg/70">
              <span className="font-bold text-fg">Latest bot rejection: </span>
              {c.latest.campaign_title ?? "Campaign"} ·{" "}
              {new Date(c.latest.created_at).toLocaleString("en-US")}
              <a
                href={c.latest.post_url}
                target="_blank"
                rel="noreferrer"
                className="ml-2 max-w-md truncate text-lime underline"
              >
                video
              </a>
            </p>
          )}

          {(c.status === "flagged" || c.status === "banned") && (
            <p className="mt-3 rounded-xl bg-fg/5 px-4 py-2.5 text-sm text-fg/70">
              Appeals arrive as Discord tickets (Terms §8 — one appeal
              per flag, a person reviews it and replies within 10
              business days). No appeal is tracked in-app.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="#submission-review"
              className="inline-flex items-center rounded-full border border-fg/20 px-4 py-2 text-sm font-bold text-fg transition hover:border-lime hover:text-lime"
            >
              View their submissions ↓
            </a>
            {c.is_blocked ? (
              <span className="inline-flex items-center rounded-full bg-red-500/15 px-4 py-2 text-sm font-bold text-red-300">
                Blocked
              </span>
            ) : (
              <button
                onClick={() => blockCreator(c)}
                disabled={busy === c.user_id}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-500/50 px-4 py-2 text-sm font-bold text-red-300 disabled:opacity-40"
              >
                {busy === c.user_id ? (
                  <>
                    <Spinner /> Loading...
                  </>
                ) : (
                  "Block creator"
                )}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
