import Link from "next/link";
import { Suspense } from "react";
import {
  getDiscoverCampaigns,
  getCampaignStatsMap,
  getTopClippers,
  getUserSubmissions,
} from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import CampaignGrid from "@/components/CampaignGrid";
import CampaignFilters from "@/components/CampaignFilters";
import WinBoard from "@/components/WinBoard";
import type { Campaign, Platform } from "@/lib/types";
import { campaignPlatforms, isCampaignCategory } from "@/lib/types";
import {
  isCampaignLive,
  sortCampaigns,
  type CampaignSort,
} from "@/lib/campaigns";

function hrefWith(
  searchParams: Record<string, string | string[] | undefined>,
  patch: Record<string, string>
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") params.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) params.set(k, v);
  const qs = params.toString();
  return `/campaigns${qs ? `?${qs}` : ""}`;
}

function loadError() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-fg">
          Campaigns
        </h1>
      </div>
      <div className="rounded-3xl border border-fg/10 bg-card p-10 text-center">
        <p className="font-display text-2xl font-black uppercase tracking-tight text-fg">
          Couldn&apos;t load campaigns
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
          Couldn&apos;t load campaigns — please try again.
        </p>
      </div>
    </div>
  );
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: {
    platform?: string;
    category?: string;
    sort?: string;
    tab?: string;
    message?: string;
  };
}) {
  // Discover (P1-a): live campaigns PLUS settling ones — ended
  // campaigns stay visible until the cleanup deletes them >= 7 days
  // after the end (migration 0023). Home keeps live-only.
  // The data getters THROW on a Supabase error (throw-contract,
  // decided by the coordinator) instead of returning [] — so a
  // failed load renders the honest error state above, never the
  // "No Live Campaigns Yet" empty state.
  let all: Campaign[];
  let stats: Awaited<ReturnType<typeof getCampaignStatsMap>>;
  let topClippers: Awaited<ReturnType<typeof getTopClippers>>;
  let joinedSubs: Awaited<ReturnType<typeof getUserSubmissions>> | null =
    null;
  const tab = searchParams.tab === "joined" ? "joined" : "explore";
  const user = await getCurrentUser();
  try {
    all = await getDiscoverCampaigns();
    if (tab === "joined" && user) {
      joinedSubs = await getUserSubmissions(user.id);
    }
  } catch {
    return loadError();
  }

  let list: Campaign[] = [...all];
  if (tab === "joined") {
    if (user) {
      const joinedIds = new Set((joinedSubs ?? []).map((s) => s.campaign_id));
      list = list.filter((c) => joinedIds.has(c.id));
    } else {
      list = [];
    }
  }
  // Filters compose: platform first, then category, then sort.
  if (searchParams.platform && searchParams.platform !== "all") {
    // A multi-platform campaign appears under every platform it
    // accepts (migration 0012) — not just its first one.
    const wanted = searchParams.platform as Platform;
    list = list.filter((c) => campaignPlatforms(c).includes(wanted));
  }
  if (searchParams.category && searchParams.category !== "all") {
    // Unknown category values are ignored (show everything) rather
    // than emptying the list.
    if (isCampaignCategory(searchParams.category)) {
      list = list.filter((c) => c.category === searchParams.category);
    }
  }
  // Stats are loaded BEFORE sorting: the Trending sort orders by
  // submission count. No extra queries — the same stats map already
  // fed the cards and the modal.
  try {
    stats = await getCampaignStatsMap(list.map((c) => c.id));
    // Win Board: real top earners from approved submissions only —
    // empty (all counts 0) until the first clip is approved.
    topClippers = await getTopClippers(5);
  } catch {
    return loadError();
  }
  // Sorts (P1-a, Content Rewards model — definitions in
  // src/lib/campaigns.ts sortCampaigns). "best" is the old
  // Recommended value and still maps to it; unknown values fall back
  // to Recommended.
  const sortParam = searchParams.sort ?? "recommended";
  const sort: CampaignSort =
    sortParam === "best"
      ? "recommended"
      : sortParam === "highest" ||
          sortParam === "new" ||
          sortParam === "trending" ||
          sortParam === "ending"
        ? sortParam
        : "recommended";
  list = sortCampaigns(list, sort, stats);

  const hasAny = all.length > 0;
  const liveCount = list.filter((c) => isCampaignLive(c)).length;
  const settlingCount = list.length - liveCount;

  return (
    <div className="space-y-6">
      {/* Shown when a logged-in user lands on /login or /signup and is
          bounced here by the middleware. */}
      {searchParams.message === "already-logged-in" && (
        <p className="rounded-xl bg-lime/10 px-4 py-3 text-center text-sm font-semibold text-lime">
          You are already logged in.
        </p>
      )}
      <div>
        <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-fg">
          Campaigns
        </h1>
        <p className="mt-2 text-sm text-fg/60">
          Funded campaigns only. Pick one, post your clip, get paid per
          view at the campaign&apos;s rate per 1,000 views. Every clip
          needs at least 1,000 views to earn — a brand may set a higher
          minimum, shown on the campaign.
        </p>
      </div>

      {/* Explore / Joined toggle pills */}
      <div className="flex rounded-full border border-fg/15 bg-card p-1">
        {[
          { key: "explore", label: "Explore" },
          { key: "joined", label: "Joined" },
        ].map((t) => (
          <Link
            key={t.key}
            href={hrefWith(searchParams, { tab: t.key })}
            className={`flex-1 rounded-full py-2.5 text-center text-sm font-black transition ${
              tab === t.key
                ? "bg-lime text-black"
                : "text-fg/70 hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="h-11 rounded-2xl border border-fg/10 bg-card" />
            <div className="h-11 rounded-2xl border border-fg/10 bg-card" />
            <div className="h-11 rounded-2xl border border-fg/10 bg-card" />
          </div>
        }
      >
        <CampaignFilters />
      </Suspense>

      <WinBoard entries={topClippers} />

      {!hasAny ? (
        <div className="rounded-3xl border border-fg/10 bg-card p-10 text-center">
          <p className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-lime/15 text-3xl">
            📣
          </p>
          <p className="mt-4 font-display text-2xl font-black uppercase tracking-tight text-fg">
            No Live Campaigns Yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            New campaigns from brands will appear here soon. Check back later.
          </p>
        </div>
      ) : tab === "joined" && !user ? (
        <div className="rounded-3xl border border-fg/10 bg-card p-10 text-center">
          <p className="font-display text-2xl font-black uppercase tracking-tight text-fg">
            Log in to see joined campaigns
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg/60">
            Campaigns you have joined will appear here.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Log in
          </Link>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-3xl border border-fg/10 bg-card p-10 text-center">
          <p className="font-display text-2xl font-black uppercase tracking-tight text-fg">
            {tab === "joined"
              ? "No campaigns joined yet"
              : "No campaigns match"}
          </p>
          <p className="mt-2 text-sm text-fg/60">
            {tab === "joined"
              ? "Pick a campaign from Explore, post your clip, and it will show up here."
              : "Try a different platform, category or sort order."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold text-fg/50">
            {list.length} campaign{list.length === 1 ? "" : "s"}
            {tab === "joined" ? " joined" : ""}
            {settlingCount > 0 &&
              ` · ${liveCount} live · ${settlingCount} completed`}
          </p>
          {settlingCount > 0 && (
            <p className="rounded-2xl bg-amber-400/10 px-4 py-3 text-sm leading-relaxed text-amber-200/90">
              Completed campaigns have ended — no new clips can be
              submitted. They are now in Campaign Review: approved
              earnings enter a 72-hour hold as soon as they are
              approved — even while the campaign is still running.
              After the campaign ends there is a 3-day re-check window,
              then payouts are made manually (about 1 week after the
              campaign ends in total). Completed campaigns are removed
              automatically after the settlement window.
            </p>
          )}
          <CampaignGrid campaigns={list} stats={stats} />
        </>
      )}
    </div>
  );
}
