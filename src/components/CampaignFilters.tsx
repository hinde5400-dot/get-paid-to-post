"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Dropdown, { type DropdownOption } from "./Dropdown";
import Spinner from "./Spinner";
import { TikTokIcon, InstagramIcon, YouTubeIcon } from "./PlatformIcons";

/**
 * Premium filter dropdowns (TryShoot-style): dark #1A1A1A cards,
 * rounded 16px, small icons, lime checkmark on the selected option,
 * smooth animation, shadow. Changing an option updates the URL query
 * params so the server page re-filters / re-sorts the real list.
 * A small grey explainer under each dropdown says what it does.
 */

const SORT_OPTIONS: DropdownOption[] = [
  { value: "best", label: "Best Match", icon: <span aria-hidden>✦</span> },
  { value: "highest", label: "Highest Pay", icon: <span aria-hidden>$</span> },
  { value: "budget", label: "Biggest Budget", icon: <span aria-hidden>▦</span> },
];

const SORT_EXPLAIN: Record<string, string> = {
  best: "Best Match — our pick: a mix of rate and budget.",
  highest: "Highest Pay shows the best rate per 1,000 views first.",
  budget: "Biggest Budget shows the largest funded budgets first.",
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

export default function CampaignFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform") ?? "all";
  const sort = searchParams.get("sort") ?? "best";
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
    <div className="grid gap-3 sm:grid-cols-2">
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
          value={sort}
          options={SORT_OPTIONS}
          onChange={(v) => update({ sort: v })}
          ariaLabel="Sort campaigns"
        />
        <p className="mt-1.5 px-1 text-xs text-fg/50">
          {SORT_EXPLAIN[sort] ?? SORT_EXPLAIN.best}
        </p>
      </div>
      {pending && (
        <p className="flex items-center gap-2 px-1 text-xs font-bold text-fg/60 sm:col-span-2">
          <Spinner className="h-3.5 w-3.5" /> Loading...
        </p>
      )}
    </div>
  );
}
