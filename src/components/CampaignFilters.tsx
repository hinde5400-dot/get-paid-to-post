"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * TryShoot-style filter dropdowns: platform ("All platforms") and sort
 * ("Best match"). Changing a dropdown updates the URL query params so
 * the server page re-filters.
 */
export default function CampaignFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform") ?? "all";
  const sort = searchParams.get("sort") ?? "best";

  function update(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) params.set(k, v);
    const qs = params.toString();
    router.push(`/campaigns${qs ? `?${qs}` : ""}`);
  }

  const selectCls =
    "w-full appearance-none rounded-full border border-fg/15 bg-card px-4 py-2.5 text-sm font-bold text-fg outline-none transition focus:border-lime [&>option]:bg-card";

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="relative block">
        <span className="sr-only">Filter by platform</span>
        <select
          value={platform}
          onChange={(e) => update({ platform: e.target.value })}
          className={selectCls}
          aria-label="Filter by platform"
        >
          <option value="all">All platforms</option>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-fg/50">
          ⌄
        </span>
      </label>
      <label className="relative block">
        <span className="sr-only">Sort campaigns</span>
        <select
          value={sort}
          onChange={(e) => update({ sort: e.target.value })}
          className={selectCls}
          aria-label="Sort campaigns"
        >
          <option value="best">Best match</option>
          <option value="highest">Highest Pay</option>
          <option value="budget">Biggest Budget</option>
          <option value="spots">Most Spots</option>
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-fg/50">
          ⌄
        </span>
      </label>
    </div>
  );
}
