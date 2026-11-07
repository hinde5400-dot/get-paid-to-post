"use client";

import { useState } from "react";
import Link from "next/link";
import type { Submission, SubmissionStatus } from "@/lib/types";
import { formatUSD } from "@/lib/money";
import { PLATFORM_LABELS } from "@/lib/constants";
import StatusBadge from "./StatusBadge";

const FILTERS: { key: "all" | SubmissionStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Under Review" },
  { key: "rejected", label: "Rejected" },
  { key: "revoked", label: "Revoked" },
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
                  ? "bg-sun text-ink"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-card p-8 text-center">
          <p className="text-lg font-bold text-white">No posts here yet</p>
          <p className="mt-2 text-sm text-white/60">
            Pick a campaign, post your clip, and submit it here to start
            earning per view.
          </p>
          <Link
            href="/campaigns"
            className="mt-4 inline-block rounded-full bg-sun px-5 py-2.5 text-sm font-bold text-ink"
          >
            Browse campaigns
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {visible.map((s) => (
            <article
              key={s.id}
              className="rounded-2xl border border-white/10 bg-card p-5"
            >
              {s.is_duplicate && (
                <p className="mb-3 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
                  ⚠️ This post duplicates content that has already been
                  submitted. It was revoked automatically.
                </p>
              )}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-sun">
                    {PLATFORM_LABELS[s.platform]}
                  </p>
                  <h3 className="mt-1 font-bold text-white">
                    {s.campaign_title ?? "Campaign"}
                  </h3>
                  <a
                    href={s.post_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block max-w-md truncate text-sm text-white/60 underline"
                  >
                    {s.post_url}
                  </a>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-white/5 py-2">
                  <p className="text-lg font-black text-white">
                    {s.views.toLocaleString()}
                  </p>
                  <p className="text-xs text-white/50">Views</p>
                </div>
                <div className="rounded-xl bg-white/5 py-2">
                  <p className="text-lg font-black text-white">
                    {s.likes.toLocaleString()}
                  </p>
                  <p className="text-xs text-white/50">Likes</p>
                </div>
                <div className="rounded-xl bg-white/5 py-2">
                  <p className="text-lg font-black text-sun">
                    {formatUSD(s.earnings)}
                  </p>
                  <p className="text-xs text-white/50">Earned</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/60">
                <span>
                  Submission ID:{" "}
                  <span className="font-mono font-bold text-white">
                    {s.submission_code || s.id.slice(0, 8)}
                  </span>
                </span>
                <button
                  onClick={() => copyId(s.submission_code || s.id)}
                  className="rounded-full border border-white/20 px-3 py-1 font-bold text-white transition hover:border-sun hover:text-sun"
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
