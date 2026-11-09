"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Dropdown, { type DropdownOption } from "./Dropdown";
import Spinner from "./Spinner";
import { TikTokIcon, InstagramIcon, YouTubeIcon } from "./PlatformIcons";
import { CAMPAIGN_CATEGORIES } from "@/lib/types";

/**
 * Premium filter dropdowns (TryShoot-style): dark #1A1A1A cards,
 * rounded 16px, small icons, lime checkmark on the selected option,
 * smooth animation, shadow. Changing an option updates the URL query
 * params so the server page re-filters / re-sorts the real list.
 * A small grey explainer under each dropdown says what it does.
 *
 * Sorts + category filter follow the Content Rewards board model
 * (P1-a): Recommended / Highest Paying / New / Trending / Ending
 * Soon, platform filter, and category filter (UGC, Clipping,
 * Lifestyle, Entertainment, Gaming, Technology). The exact sort
 * definitions live in src/lib/campaigns.ts (sortCampaigns). There
 * are NO category slider rows — filters only.
 */

const SORT_OPTIONS: DropdownOption[] = [
  { value: "recommended", label: "Recommended", icon: <span aria-hidden>✦</span> },
  { value: "highest", label: "Highest Paying", icon: <span aria-hidden>$</span> },
  { value: "new", label: "New", icon: <span aria-hidden>✚</span> },
  { value: "trending", label: "Trending", icon: <span aria-hidden>↗</span> },
  { value: "ending", label: "Ending Soon", icon: <span aria-hidden>⏳</span> },
];

const SORT_EXPLAIN: Record<string, string> = {
  recommended:
    "Recommended — live campaigns first, least budget used, then newest.",
  highest: "Highest Paying shows the best rate per 1,000 views first.",
  new: "New shows the most recently created campaigns first.",
  trending:
    "Trending shows the campaigns with the most submitted clips first.",
  ending:
    "Ending Soon shows the campaigns whose deadline comes first; open-ended campaigns last.",
};

const PLATFORM_OPTIONS: DropdownOption[] = [
  { value: "all", label: "All Platforms", icon: <span aria-hidden>◎</span> },
  {
    value: "tiktok",
    label: "TikTok",
    icon: <TikTokIcon className="h-4 w-4" />,
  },
  {
    value: "instagram",
    label: "Instagram",
    icon: <InstagramIcon className="h-4 w-4" />,
  },
  {
    value: "youtube",
    label: "YouTube",
    icon: <YouTubeIcon className="h-4 w-4" />,
  },
];

const PLATFORM_EXPLAIN: Record<string, string> = {
  all: "Show campaigns for every platform.",
  tiktok: "Only campaigns that pay for TikTok clips.",
  instagram: "Only campaigns that pay for Instagram Reels.",
  youtube: "Only campaigns that pay for YouTube Shorts.",
};

const CATEGORY_OPTIONS: DropdownOption[] = [
  { value: "all", label: "All Categories", icon: <span aria-hidden>◎</span> },
  ...CAMPAIGN_CATEGORIES.map((c) => ({
    value: c,
    label: c,
    icon: <span aria-hidden>▸</span>,
  })),
];

const CATEGORY_EXPLAIN: Record<string, string> = {
  all: "Show campaigns in every category.",
  UGC: "Only UGC campaigns — clips made for a brand.",
  Clipping: "Only Clipping campaigns — clips cut from longer content.",
  Lifestyle: "Only Lifestyle campaigns.",
  Entertainment: "Only Entertainment campaigns.",
  Gaming: "Only Gaming campaigns.",
  Technology: "Only Technology campaigns.",
};

export default function CampaignFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const sort = searchParams.get("sort") ?? "recommended";
  const [pending, setPending] = useState(false);
  const paramsString = searchParams.toString();

  // The list re-filters server-side after a selection, so show
  // "Loading..." until the new params actually arrive.
  useEffect(() => {
    setPending(false);
  }, [paramsString]);

  function update(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) params.set(k, v);
    const qs = params.toString();
    if (qs === searchParams.toString()) return;
    setPending(true);
    router.push(`/campaigns${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <Dropdown
          value={platform}
          options={PLATFORM_OPTIONS}
          onChange={(v) => update({ platform: v })}
          ariaLabel="Filter by platform"
        />
        <p className="mt-1.5 px-1 text-xs text-fg/50">
          {PLATFORM_EXPLAIN[platform] ?? PLATFORM_EXPLAIN.all}
        </p>
      </div>
      <div>
        <Dropdown
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={(v) => update({ category: v })}
          ariaLabel="Filter by category"
        />
        <p className="mt-1.5 px-1 text-xs text-fg/50">
          {CATEGORY_EXPLAIN[category] ?? CATEGORY_EXPLAIN.all}
        </p>
      </div>
      <div>
        <Dropdown
          value={sort}
          options={SORT_OPTIONS}
          onChange={(v) => update({ sort: v })}
          ariaLabel="Sort campaigns"
        />
        <p className="mt-1.5 px-1 text-xs text-fg/50">
          {SORT_EXPLAIN[sort] ?? SORT_EXPLAIN.recommended}
        </p>
      </div>
      {pending && (
        <p className="flex items-center gap-2 px-1 text-xs font-bold text-fg/60 sm:col-span-2 lg:col-span-3">
          <Spinner className="h-3.5 w-3.5" /> Loading...
        </p>
      )}
    </div>
  );
}
