"use client";

import { useState } from "react";
import type { Platform } from "@/lib/types";
import { formatUSD } from "@/lib/money";
import { PLATFORM_LABELS } from "@/lib/constants";
import StatusBadge from "./StatusBadge";

export interface CreatorClip {
  id: string;
  campaign_title: string;
  platform: Platform;
  post_url: string;
  views: number;
  earnings: number;
  status: "pending" | "approved" | "rejected";
}

export interface CreatorRow {
  user_id: string;
  email: string;
  clips: number;
  views: number;
  earnings: number;
  clipList: CreatorClip[];
}

/**
 * CREATORS (admin batch 2, Content Rewards-style): every creator
 * who has submitted, with clip count, total views and total
 * earnings. Click a creator to see their clips. Display-only over
 * existing submissions data — no actions, no money changes.
 */
export default function AdminCreatorsList({
  creators,
}: {
  creators: CreatorRow[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (creators.length === 0) {
    return (
      <div className="rounded-2xl border border-fg/10 bg-card p-8 text-center">
        <p className="font-bold text-fg">No creators yet</p>
        <p className="mt-1 text-sm text-fg/60">
          Creators who submit a clip will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {creators.map((c) => {
        const open = expanded === c.user_id;
        return (
          <article
            key={c.user_id}
            className="rounded-2xl border border-fg/10 bg-card p-5"
          >
            <button
              type="button"
              onClick={() => setExpanded(open ? null : c.user_id)}
              aria-expanded={open}
              className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-red-300">
                  Creator
                </p>
                <h3 className="mt-1 font-bold text-fg">{c.email}</h3>
                <p className="mt-1 text-sm text-fg/70">
                  {c.clips} clip{c.clips === 1 ? "" : "s"} ·{" "}
                  {c.views.toLocaleString()} total views ·{" "}
                  <span className="font-bold text-fg">
                    {formatUSD(c.earnings)}
                  </span>{" "}
                  earned
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-fg/20 px-3 py-1 text-xs font-bold text-fg">
                {open ? "Hide clips ▲" : "Show clips ▼"}
              </span>
            </button>

            {open && (
              <ul className="mt-4 space-y-2 border-t border-fg/10 pt-4">
                {c.clipList.map((clip) => (
                  <li
                    key={clip.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-fg/5 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-fg/50">
                        {PLATFORM_LABELS[clip.platform]} ·{" "}
                        {clip.campaign_title}
                      </p>
                      <a
                        href={clip.post_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 block max-w-md truncate text-sm text-fg/70 underline"
                      >
                        {clip.post_url}
                      </a>
                      <p className="mt-0.5 text-xs text-fg/50">
                        {clip.views.toLocaleString()} views ·{" "}
                        {formatUSD(clip.earnings)}
                      </p>
                    </div>
                    <StatusBadge status={clip.status} />
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </div>
  );
}
