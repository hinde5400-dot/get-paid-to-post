"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { Campaign, Platform } from "@/lib/types";
import type { CampaignStats } from "@/lib/data";
import {
  TikTokIcon,
  InstagramIcon,
  YouTubeIcon,
} from "./PlatformIcons";
import DiscordButton from "./DiscordButton";

/**
 * TryShoot-style brand page tabs: Home / Apps / Chats / About,
 * with a lime "Join Shoot →" button. Member / active counts come from
 * real submissions only (see data.ts); when they cannot be computed
 * the counts are omitted, never invented.
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
}: {
  campaign: Campaign;
  stats: CampaignStats | null;
  home: ReactNode;
  about: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const platforms: Platform[] =
    campaign.platform === "all"
      ? ["tiktok", "instagram", "youtube"]
      : [campaign.platform];

  function joinShoot() {
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
              Submission status is always visible on My Posts and Earnings.
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
                ? `${stats.active30d} Active Today`
                : "Join free — no follower minimum"}
            </p>
          </div>
          <button
            type="button"
            onClick={joinShoot}
            className="ml-auto rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Join Shoot →
          </button>
        </div>
      </div>
    </div>
  );
}
