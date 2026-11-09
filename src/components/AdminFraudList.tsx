"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOT_AUTO_BAN_COUNT,
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
 *
 * Banned creators sit in their own section at the top, each with
 * an Unblock button. Unblocking asks for confirmation first and
 * shows why they were banned (bot-rejection count, flagged date,
 * banned date, latest bot rejection). After an unblock the ladder
 * restarts from zero — earlier rejections stay visible as history
 * but no longer count — and the row shows "Previously banned"
 * with the unblock date.
 */
export interface FraudCreator {
  user_id: string;
  email: string;
  bot_rejections: number;
  status: FraudStatus;
  is_blocked: boolean;
  flagged_at: string | null;
  banned_at: string | null;
  unblocked_at: string | null;
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

  async function unblockCreator(c: FraudCreator) {
    const fmt = (d: string | null) =>
      d ? new Date(d).toLocaleString("en-US") : "not recorded";
    const lines = [
      `Unblock ${c.email}?`,
      ``,
      `Why they were banned:`,
      `- ${c.bot_rejections} bot-view rejection${c.bot_rejections === 1 ? "" : "s"}${c.bot_rejections >= BOT_AUTO_BAN_COUNT ? " (auto-banned after 11)" : ""}`,
      `- Flagged: ${fmt(c.flagged_at)}`,
      `- Banned: ${fmt(c.banned_at)}`,
    ];
    if (c.latest) {
      lines.push(
        `- Latest bot rejection: ${c.latest.campaign_title ?? "Campaign"} · ${fmt(c.latest.created_at)}`,
        `  Video: ${c.latest.post_url}`
      );
    } else {
      lines.push(`- Latest bot rejection: none recorded`);
    }
    lines.push(
      ``,
      `Unblocking gives them a fresh start — earlier bot rejections stay visible as history but no longer count toward a re-ban.`
    );
    if (!window.confirm(lines.join("\n"))) {
      return;
    }
    setBusy(c.user_id);
    try {
      const res = await fetch("/api/admin/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: c.user_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unblock failed.");
      showSuccess(data.message ?? "Creator unblocked.");
      router.refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Unblock failed.");
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

  // Banned creators first, in their own section at the top.
  const banned = creators.filter((c) => c.status === "banned");
  const others = creators.filter((c) => c.status !== "banned");

  function renderCreator(c: FraudCreator) {
    return (
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
                (c.bot_rejections >= BOT_AUTO_BAN_COUNT
                  ? " — auto-banned after 11 bot-view rejections."
                  : " — blocked by the owner.")}
            </p>
            {c.flagged_at && (
              <p className="mt-1 text-xs text-fg/50">
                Flagged{" "}
                {new Date(c.flagged_at).toLocaleString("en-US")}
                {c.banned_at &&
                  ` · Banned ${new Date(c.banned_at).toLocaleString("en-US")}`}
              </p>
            )}
            {c.unblocked_at && !c.is_blocked && (
              <p className="mt-1 text-xs text-fg/50">
                Previously banned — unblocked{" "}
                {new Date(c.unblocked_at).toLocaleString("en-US")}
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
            <>
              <span className="inline-flex items-center rounded-full bg-red-500/15 px-4 py-2 text-sm font-bold text-red-300">
                Blocked
              </span>
              <button
                onClick={() => unblockCreator(c)}
                disabled={busy === c.user_id}
                className="inline-flex items-center gap-1.5 rounded-full border border-lime/50 px-4 py-2 text-sm font-bold text-lime disabled:opacity-40"
              >
                {busy === c.user_id ? (
                  <>
                    <Spinner /> Loading...
                  </>
                ) : (
                  "Unblock creator"
                )}
              </button>
            </>
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
    );
  }

  return (
    <div className="space-y-6">
      {banned.length > 0 && (
        <section>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-display text-base font-black uppercase tracking-tight text-red-300">
              Banned
            </h3>
            <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
              {banned.length} banned creator{banned.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-1 text-sm text-fg/60">
            Blocked accounts cannot log in, submit, or withdraw. Unblock
            to give a creator a fresh start — earlier bot rejections
            stay visible as history but no longer count toward a re-ban.
          </p>
          <div className="mt-4 space-y-4">{banned.map(renderCreator)}</div>
        </section>
      )}
      {others.length > 0 && (
        <section>
          {banned.length > 0 && (
            <h3 className="font-display text-base font-black uppercase tracking-tight text-fg">
              Watch list
            </h3>
          )}
          <div className="mt-4 space-y-4">{others.map(renderCreator)}</div>
        </section>
      )}
    </div>
  );
}
