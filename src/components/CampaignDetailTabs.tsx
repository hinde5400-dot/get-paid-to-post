"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { Campaign, Platform } from "@/lib/types";
import { campaignPlatforms } from "@/lib/types";
import type { CampaignStats } from "@/lib/data";
import type { BrandCampaignClip } from "@/lib/brand-clips";
import { formatUSD } from "@/lib/money";
import {
  TikTokIcon,
  InstagramIcon,
  YouTubeIcon,
} from "./PlatformIcons";
import DiscordButton from "./DiscordButton";

/**
 * Campaign detail tabs: Home / Apps / Chats / About, with a lime
 * "Submit a clip →" button. Member / active counts come from
 * real submissions only (see data.ts); when they cannot be computed
 * the counts are omitted, never invented. The Apps tab shows the
 * campaign's own clips (link, platform, views, earnings, status)
 * to the campaign's brand owner only (Round-4 P1-B3).
 */

type Tab = "home" | "apps" | "chats" | "about";

const TABS: { key: Tab; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "apps", label: "Apps" },
  { key: "chats", label: "Chats" },
  { key: "about", label: "About" },
];

const PLATFORM_SITES: {
  key: Platform;
  name: string;
  url: string;
  Icon: (props: { className?: string }) => JSX.Element;
}[] = [
  { key: "tiktok", name: "TikTok", url: "https://www.tiktok.com", Icon: TikTokIcon },
  { key: "instagram", name: "Instagram", url: "https://www.instagram.com", Icon: InstagramIcon },
  { key: "youtube", name: "YouTube", url: "https://www.youtube.com", Icon: YouTubeIcon },
];

export default function CampaignDetailTabs({
  campaign,
  stats,
  home,
  about,
  brandClips = null,
  isBrandOwner = false,
  clipsUnavailable = false,
}: {
  campaign: Campaign;
  stats: CampaignStats | null;
  home: ReactNode;
  about: ReactNode;
  /** This campaign's clips, for the brand owner only (P1-B3). */
  brandClips?: BrandCampaignClip[] | null;
  isBrandOwner?: boolean;
  /** True when clips exist but are not readable by this caller. */
  clipsUnavailable?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("home");
  // Platforms this campaign accepts (migration 0012): the chosen
  // list, falling back to the legacy single platform column.
  const platforms = campaignPlatforms(campaign);

  function submitClip() {
    setTab("home");
    // Wait a tick for the Home tab (with the submit form) to render.
    requestAnimationFrame(() => {
      document
        .getElementById("submit")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div>
      {/* Tabs */}
      <div
        className="flex gap-1 rounded-full border border-fg/15 bg-card p-1"
        role="tablist"
        aria-label="Campaign sections"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-full py-2.5 text-center text-sm font-black transition ${
              tab === t.key ? "bg-lime text-black" : "text-fg/70 hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "home" && home}

        {tab === "apps" && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-fg/10 bg-card p-6">
              <h2 className="font-display text-lg font-black tracking-tight text-fg">
                Where to post
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-fg/60">
                This campaign runs on{" "}
                {platforms
                  .map((p) => PLATFORM_SITES.find((s) => s.key === p)?.name)
                  .join(" · ")}
                . Post your clip on any of them, then submit the link from
                the Home tab.
              </p>
              <p className="mt-2 text-sm font-semibold text-amber-200">
                ⏱ Submit your link within 30 minutes of posting — a link
                posted more than 30 minutes earlier is not accepted.
                Instagram links are hand-checked by the admin (no
                automatic check yet).
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {platforms.map((p) => {
                  const site = PLATFORM_SITES.find((s) => s.key === p)!;
                  return (
                    <a
                      key={p}
                      href={site.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-2xl bg-fg/5 p-4 transition hover:bg-fg/10"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime/15 text-lime">
                        <site.Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-bold text-fg">
                          {site.name}
                        </span>
                        <span className="block text-xs text-fg/50">
                          Open {site.name} →
                        </span>
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Round-4 P1-B3: the brand owner sees every clip on
                its own campaign here — link, platform, views,
                earnings and status. Creators never see this card. */}
            {isBrandOwner && (
              <div className="rounded-3xl border border-fg/10 bg-card p-6">
                <h2 className="font-display text-lg font-black tracking-tight text-fg">
                  Clips on this campaign
                </h2>
                {clipsUnavailable ? (
                  <p className="mt-2 text-sm leading-relaxed text-fg/60">
                    Clips have been submitted to this campaign, but
                    their details are not available here yet — ask the
                    admin on Discord for the per-clip record for your
                    campaign.
                  </p>
                ) : brandClips && brandClips.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {brandClips.map((clip) => (
                      <li
                        key={clip.id}
                        className="rounded-2xl bg-fg/5 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black text-fg">
                            {PLATFORM_SITES.find((s) => s.key === clip.platform)
                              ?.name ?? clip.platform}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                              clip.status === "approved"
                                ? "bg-lime/15 text-lime"
                                : clip.status === "rejected"
                                  ? "bg-fg/10 text-fg/50"
                                  : "bg-amber-500/15 text-amber-300"
                            }`}
                          >
                            {clip.status}
                          </span>
                          <a
                            href={clip.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto text-xs font-bold text-lime underline"
                          >
                            Open clip ↗
                          </a>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-fg/60">
                          {clip.views.toLocaleString("en-US")} views ·
                          Likes {clip.likes.toLocaleString("en-US")} ·
                          Comments {clip.comments.toLocaleString("en-US")} ·
                          Earned {formatUSD(clip.earnings)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-fg/60">
                    No clips have been submitted to this campaign yet.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "chats" && (
          <div className="rounded-3xl border border-fg/10 bg-card p-6 text-center">
            <p className="text-4xl">💬</p>
            <h2 className="mt-3 font-display text-lg font-black tracking-tight text-fg">
              Talk about this campaign
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-fg/60">
              There is no live chat on the site. Join our Discord community
              to talk about this campaign, ask questions, and get support.
              Submission status is always visible on My Posts.
            </p>
            <div className="mx-auto mt-5 max-w-sm">
              <DiscordButton />
            </div>
            <Link
              href="/support"
              className="mt-4 inline-block text-sm font-bold text-lime hover:underline"
            >
              Contact Support →
            </Link>
          </div>
        )}

        {tab === "about" && about}
      </div>

      {/* Sticky bottom bar — sits above the bottom nav on mobile. */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-fg/10 bg-ink/95 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div>
            <p className="font-display text-lg font-black leading-none text-fg">
              Free
            </p>
            <p className="mt-1 text-xs font-semibold text-fg/50">
              {stats
                ? `${stats.active30d} active creators (30 days)`
                : "Join free — no follower minimum"}
            </p>
          </div>
          <button
            type="button"
            onClick={submitClip}
            className="ml-auto rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Submit a clip →
          </button>
        </div>
      </div>
    </div>
  );
}
