"use client";

import { useState } from "react";
import Link from "next/link";
import type { Platform, Submission, SubmissionStatus } from "@/lib/types";
import { formatUSD } from "@/lib/money";
import {
  engagementRate,
  formatEngagementRate,
  MIN_ENGAGEMENT_RATE,
} from "@/lib/engagement";
import { DISCORD_URL, PLATFORM_LABELS } from "@/lib/constants";
import StatusBadge from "./StatusBadge";
import { PlatformChips } from "./PlatformIcons";

/**
 * Participant history (migration 0027): one row per campaign this
 * creator joined, saved when the ended campaign is auto-deleted.
 * Only the creator who joined ever sees their own rows (RLS:
 * auth.uid() = user_id) — never shown on Discover, never to
 * non-joiners.
 */
export interface CampaignHistoryRow {
  id: string;
  campaign_id: string | null;
  campaign_title: string | null;
  brand_name: string | null;
  platforms: string[] | null;
  joined_at: string | null;
  clips_submitted: number;
  clips_approved: number;
  total_views: number;
  total_earned: number;
  status: string;
}

function validPlatforms(raw: string[] | null): Platform[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is Platform =>
      p === "tiktok" || p === "instagram" || p === "youtube"
  );
}

const FILTERS: { key: "all" | SubmissionStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Under Review" },
  { key: "rejected", label: "Rejected" },
];

export default function MyPostsList({
  submissions,
  pastCampaigns = [],
}: {
  submissions: Submission[];
  /** Participant history (migration 0027) — this creator's own rows only. */
  pastCampaigns?: CampaignHistoryRow[];
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
            Pick a campaign, post your clip, and submit the link from
            the campaign page to start earning per view.
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
              {s.status === "rejected" && (
                <p className="mt-3 rounded-xl bg-fg/5 px-4 py-2.5 text-sm leading-relaxed text-fg/70">
                  No resubmit — this clip is done. Post a new clip to try
                  again.
                </p>
              )}
              {/* Active flag: the payout is PAUSED, not just under
                  review. The creator must see the reason — a
                  flagged clip used to look identical to an ordinary
                  pending one. */}
              {s.flag_reason && (
                <p className="mt-3 rounded-xl bg-amber-500/15 px-4 py-2.5 text-sm font-semibold leading-relaxed text-amber-200">
                  ⚠ Flagged — payout paused: {s.flag_reason}. The admin
                  is reviewing it. If you believe it is a mistake, you
                  can appeal once via Discord support.
                </p>
              )}
              <div className="mt-4 grid grid-cols-4 gap-3 text-center">
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
                  <p className="text-lg font-black text-fg">
                    {s.comments.toLocaleString()}
                  </p>
                  <p className="text-xs text-fg/50">Comments</p>
                </div>
                <div className="rounded-xl bg-fg/5 py-2">
                  <p className="text-lg font-black text-lime">
                    {formatUSD(s.earnings)}
                  </p>
                  <p className="text-xs text-fg/50">Earned</p>
                </div>
              </div>
              {/* Engagement self-check vs the 1% gate (likes +
                  comments only). */}
              {(() => {
                const rate = engagementRate(s.likes, s.comments, s.views);
                if (rate === null) return null;
                const ok = rate >= MIN_ENGAGEMENT_RATE;
                return (
                  <p
                    className={`mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold leading-relaxed ${
                      ok
                        ? "bg-lime/10 text-lime"
                        : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    Engagement {formatEngagementRate(rate)} (likes +
                    comments / views) —{" "}
                    {ok
                      ? "above the 1% minimum ✓"
                      : "below the 1% minimum — this clip cannot be approved"}
                  </p>
                );
              })()}
              {/* Earnings breakdown — locked at approval: the views
                  above are the latest count and may have grown
                  since, so the math is never restated from them. */}
              {s.status === "approved" &&
                s.views > 0 &&
                s.rate_per_1k !== undefined && (
                  <p className="mt-3 rounded-xl bg-lime/10 px-4 py-2.5 text-sm leading-relaxed text-fg/80">
                    Your video earned {formatUSD(s.earnings)} at{" "}
                    {formatUSD(s.rate_per_1k as number)}/1k.
                    {s.max_payout_per_post !== undefined &&
                    s.max_payout_per_post !== null &&
                    s.earnings >= s.max_payout_per_post
                      ? ` The per-post cap of ${formatUSD(s.max_payout_per_post)} applied.`
                      : ""}{" "}
                    Earnings were locked when the clip was approved —
                    the views above are the latest count.
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
                    {new Date(s.hold_until).getTime() <= Date.now()
                      ? "Hold released — available to withdraw"
                      : `Hold releases ${new Date(s.hold_until).toLocaleString("en-US")}`}
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

      {/* Past campaigns — participant history (migration 0027).
          Below the submissions list, and only ever this creator's
          own rows. A deleted campaign lives on here, nowhere else. */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
          Past campaigns
        </h2>
        <p className="mt-1 text-sm text-fg/60">
          Campaigns you joined that have ended and settled. Only you can
          see this history.
        </p>
        {pastCampaigns.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-fg/10 bg-card p-8 text-center">
            <p className="text-lg font-bold text-fg">No past campaigns yet</p>
            <p className="mt-2 text-sm text-fg/60">
              Campaigns you join will show up here once they end — even
              after they are removed from Discover.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {pastCampaigns.map((h) => {
              const platforms = validPlatforms(h.platforms);
              return (
                <article
                  key={h.id}
                  className="rounded-2xl border border-fg/10 bg-card p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-fg">
                        {h.campaign_title ?? "Campaign"}
                      </h3>
                      {h.brand_name && (
                        <p className="mt-1 text-sm text-fg/60">
                          {h.brand_name}
                        </p>
                      )}
                      {platforms.length > 0 && (
                        <div className="mt-2">
                          <PlatformChips
                            platform="all"
                            platforms={platforms}
                            size="sm"
                          />
                        </div>
                      )}
                    </div>
                    <span className="rounded-full bg-lime/15 px-3 py-1 text-xs font-bold text-lime">
                      {h.status === "ended"
                        ? "Ended"
                        : h.status === "completed"
                          ? "Completed"
                          : h.status.charAt(0).toUpperCase() + h.status.slice(1)}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-fg/5 py-2">
                      <p className="text-lg font-black text-fg">
                        {h.clips_approved} / {h.clips_submitted}
                      </p>
                      <p className="text-xs text-fg/50">Clips approved</p>
                    </div>
                    <div className="rounded-xl bg-fg/5 py-2">
                      <p className="text-lg font-black text-fg">
                        {h.total_views.toLocaleString()}
                      </p>
                      <p className="text-xs text-fg/50">Views</p>
                    </div>
                    <div className="rounded-xl bg-fg/5 py-2">
                      <p className="text-lg font-black text-lime">
                        {formatUSD(h.total_earned)}
                      </p>
                      <p className="text-xs text-fg/50">Earned</p>
                    </div>
                  </div>
                  {h.joined_at && (
                    <p className="mt-4 text-xs text-fg/60">
                      Joined{" "}
                      {new Date(h.joined_at).toLocaleDateString("en-US")}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
