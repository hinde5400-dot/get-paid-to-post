import Link from "next/link";
import { getCampaigns } from "@/lib/data";
import CampaignCard from "@/components/CampaignCard";
import AdSlot from "@/components/AdSlot";
import { PLATFORM_LABELS } from "@/lib/constants";
import type { Campaign } from "@/lib/types";

const PLATFORM_FILTERS = [
  { key: "all", label: "All platforms" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
];

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
  searchParams: { platform?: string; category?: string; sort?: string };
}) {
  const all = await getCampaigns();
  const categories = Array.from(new Set(all.map((c) => c.category))).sort();

  let list: Campaign[] = [...all];
  if (searchParams.platform && searchParams.platform !== "all") {
    list = list.filter(
      (c) =>
        c.platform === searchParams.platform || c.platform === "all"
    );
  }
  if (searchParams.category) {
    list = list.filter((c) => c.category === searchParams.category);
  }
  if (searchParams.sort === "highest") {
    list.sort((a, b) => b.rate_per_1m - a.rate_per_1m);
  } else if (searchParams.sort === "budget") {
    list.sort((a, b) => b.budget_total - a.budget_total);
  } else if (searchParams.sort === "spots") {
    list.sort((a, b) => b.spots_left - a.spots_left);
  }

  const activePlatform = searchParams.platform ?? "all";
  const activeCategory = searchParams.category ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Campaigns</h1>
        <p className="mt-2 text-sm text-white/60">
          Funded campaigns only. Pick one, post your clip, get paid per view.
          Base pay $10 per approved post, plus $0.75 per 1,000 views.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PLATFORM_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={hrefWith(searchParams, { platform: f.key })}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              activePlatform === f.key
                ? "bg-sun text-ink"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <div className="ml-auto flex gap-2">
          {[
            { key: "highest", label: "Highest Pay" },
            { key: "budget", label: "Biggest Budget" },
            { key: "spots", label: "Most Spots" },
          ].map((s) => (
            <Link
              key={s.key}
              href={hrefWith(searchParams, { sort: s.key })}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                (searchParams.sort ?? "highest") === s.key
                  ? "bg-sun text-ink"
                  : "bg-white/10 text-white/70"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={hrefWith(searchParams, { category: "" })}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              !activeCategory
                ? "bg-sun text-ink"
                : "bg-white/10 text-white/70"
            }`}
          >
            All categories
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat}
              href={hrefWith(searchParams, { category: cat })}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                activeCategory === cat
                  ? "bg-sun text-ink"
                  : "bg-white/10 text-white/70"
              }`}
            >
              {cat}
            </Link>
          ))}
        </div>
      )}

      <AdSlot />

      {list.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-card p-8 text-center">
          <p className="text-lg font-bold text-white">No campaigns match</p>
          <p className="mt-1 text-sm text-white/60">
            Try a different platform or category.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-white/50">
            {list.length} campaign{list.length === 1 ? "" : "s"} ·{" "}
            {PLATFORM_LABELS[activePlatform] ?? "All platforms"}
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
