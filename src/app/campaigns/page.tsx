import Link from "next/link";
import {
  getCampaigns,
  getCampaignStatsMap,
  getUserSubmissions,
} from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import CampaignGrid from "@/components/CampaignGrid";
import CampaignFilters from "@/components/CampaignFilters";
import AdSlot from "@/components/AdSlot";
import type { Campaign } from "@/lib/types";

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

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { platform?: string; sort?: string; tab?: string };
}) {
  const all = await getCampaigns();
  const tab = searchParams.tab === "joined" ? "joined" : "explore";
  const user = await getCurrentUser();

  let list: Campaign[] = [...all];
  if (tab === "joined") {
    if (user) {
      const subs = await getUserSubmissions(user.id);
      const joinedIds = new Set(subs.map((s) => s.campaign_id));
      list = list.filter((c) => joinedIds.has(c.id));
    } else {
      list = [];
    }
  }
  if (searchParams.platform && searchParams.platform !== "all") {
    list = list.filter(
      (c) => c.platform === searchParams.platform || c.platform === "all"
    );
  }
  if (searchParams.sort === "highest") {
    list.sort((a, b) => b.rate_per_1m - a.rate_per_1m);
  } else if (searchParams.sort === "budget") {
    list.sort((a, b) => b.budget_total - a.budget_total);
  } else if (searchParams.sort === "spots") {
    list.sort((a, b) => b.spots_left - a.spots_left);
  }

  const hasAny = all.length > 0;
  const stats = await getCampaignStatsMap(list.map((c) => c.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-fg">
          Campaigns
        </h1>
        <p className="mt-2 text-sm text-fg/60">
          Funded campaigns only. Pick one, post your clip, get paid per view.
          Base pay $10 per approved post, plus $0.75 per 1,000 views.
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

      <CampaignFilters />

      <AdSlot />

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
          <Link
            href="/brands"
            className="mt-6 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            I am a Brand — launch a campaign
          </Link>
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
              : "Try a different platform or sort order."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold text-fg/50">
            {list.length} campaign{list.length === 1 ? "" : "s"}
            {tab === "joined" ? " joined" : " live"}
          </p>
          <CampaignGrid campaigns={list} stats={stats} />
        </>
      )}
    </div>
  );
}
