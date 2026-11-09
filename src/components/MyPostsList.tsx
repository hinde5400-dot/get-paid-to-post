"use client";

import { useState } from "react";
import Link from "next/link";
import type { Submission, SubmissionStatus } from "@/lib/types";
import { formatUSD, payoutForViews } from "@/lib/money";
import { DISCORD_URL, PLATFORM_LABELS } from "@/lib/constants";
import StatusBadge from "./StatusBadge";

const FILTERS: { key: "all" | SubmissionStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Under Review" },
  { key: "rejected", label: "Rejected" },
];

export default function MyPostsList({
  submissions,
}: {
  submissions: Submission[];
}) {
  const [filter, setFilter] = useState<"all" | SubmissionStatus>("all");
  const [copied, setCopied] = useState<string | null>(null);

  const visible =
    filter === "all"
      ? submissions
      : submissions.filter((s) => s.status === filter);

  async function copyId(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard unavailable — the code is still visible on screen.
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? submissions.length
              : submissions.filter((s) => s.status === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                filter === f.key
                  ? "bg-lime text-ink"
                  : "bg-fg/10 text-fg/70 hover:bg-fg/20"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-fg/10 bg-card p-8 text-center">
          <p className="text-lg font-bold text-fg">No posts here yet</p>
          <p className="mt-2 text-sm text-fg/60">
            Pick a campaign, post your clip, and submit it here to start
            earning per view.
          </p>
          <Link
            href="/campaigns"
            className="mt-4 inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-ink"
          >
            Browse campaigns
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {visible.map((s) => (
            <article
              key={s.id}
              className="rounded-2xl border border-fg/10 bg-card p-5"
            >
              {s.is_duplicate && (
                <p className="mb-3 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
                  ⚠️ This post duplicates content that has already been
                  submitted. It was rejected automatically.
                </p>
              )}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-lime">
                    {PLATFORM_LABELS[s.platform]}
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
                </div>
                <StatusBadge status={s.status} />
              </div>
              {s.status === "rejected" && s.rejection_reason && (
                <p className="mt-3 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
                  Rejected: {s.rejection_reason}
                </p>
              )}
              {/* Appeals (P1-c, Content Rewards model: one appeal per
                  flag, aim 10 business days; Terms §8). One appeal
                  per rejection, via Discord — a person reviews it.
                  No in-app appeals system: the appeal itself happens
                  on Discord. */}
              {s.status === "rejected" && (
                <p className="mt-3 rounded-xl bg-fg/5 px-4 py-2.5 text-sm leading-relaxed text-fg/70">
                  Think this was a mistake? You get one appeal for this
                  rejection — open a ticket on our{" "}
                  <a
                    href={DISCORD_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-lime underline"
                  >
                    Discord server
                  </a>{" "}
                  and a person will review it. We aim to reply within 10
                  business days.
                </p>
              )}
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-fg/5 py-2">
                  <p className="text-lg font-black text-fg">
                    {s.views.toLocaleString()}
                  </p>
                  <p className="text-xs text-fg/50">Views</p>
                </div>
                <div className="rounded-xl bg-fg/5 py-2">
                  <p className="text-lg font-black text-fg">
                    {s.likes.toLocaleString()}
                  </p>
                  <p className="text-xs text-fg/50">Likes</p>
                </div>
                <div className="rounded-xl bg-fg/5 py-2">
                  <p className="text-lg font-black text-lime">
                    {formatUSD(s.earnings)}
                  </p>
                  <p className="text-xs text-fg/50">Earned</p>
                </div>
              </div>
              {/* Earnings breakdown with the per-post cap applied —
                  the exact math, from the submission's real numbers. */}
              {s.status === "approved" &&
                s.views > 0 &&
                s.rate_per_1k !== undefined && (
                  <p className="mt-3 rounded-xl bg-lime/10 px-4 py-2.5 text-sm leading-relaxed text-fg/80">
                    {(() => {
                      const calc = payoutForViews(
                        s.views,
                        s.rate_per_1k as number,
                        s.max_payout_per_post ?? s.earnings
                      );
                      return calc.capped
                        ? `Your video got ${s.views.toLocaleString()} views at ${formatUSD(s.rate_per_1k as number)}/1k = ${formatUSD(calc.uncapped)} earned. Cap ${formatUSD(s.max_payout_per_post ?? s.earnings)} applied, you earned ${formatUSD(s.earnings)}.`
                        : `Your video got ${s.views.toLocaleString()} views at ${formatUSD(s.rate_per_1k as number)}/1k = ${formatUSD(s.earnings)} earned.`;
                    })()}
                  </p>
                )}
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-fg/60">
                <span>
                  Submission ID:{" "}
                  <span className="font-mono font-bold text-fg">
                    {s.submission_code || s.id.slice(0, 8)}
                  </span>
                </span>
                <button
                  onClick={() => copyId(s.submission_code || s.id)}
                  className="rounded-full border border-fg/20 px-3 py-1 font-bold text-fg transition hover:border-lime hover:text-lime"
                >
                  {copied === (s.submission_code || s.id)
                    ? "Copied ✓"
                    : "Copy ID"}
                </button>
                {s.hold_until && s.status === "approved" && (
                  <span>
                    Hold releases{" "}
                    {new Date(s.hold_until).toLocaleString("en-US")}
                  </span>
                )}
                <span>
                  {new Date(s.created_at).toLocaleDateString("en-US")}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
