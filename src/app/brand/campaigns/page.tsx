import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getModeContext } from "@/lib/mode";
import {
  campaignStatus,
  getBrandCampaigns,
  getBrandCampaignStats,
  isExpiredUnpaidPending,
  type BrandCampaignStats,
} from "@/lib/data";
import { budgetBarClass, budgetUsedPct, formatUSD } from "@/lib/money";
import {
  BrandDeleteButton,
  BrandPauseButton,
} from "@/components/BrandCampaignButtons";
import type { Campaign } from "@/lib/types";

export const metadata: Metadata = {
  title: "My Campaigns",
  description:
    "Your brand's campaigns: live, pending and ended — with clips, approvals and payments.",
};

type BrandTab = "live" | "pending" | "ended";

const TABS: { key: BrandTab; label: string }[] = [
  { key: "live", label: "Live" },
  { key: "pending", label: "Pending" },
  { key: "ended", label: "Ended" },
];

/**
 * Which tab a campaign belongs to. Live = funded and running
 * (a paused campaign stays Live — it is frozen, not ended).
 * Pending = status pending (an expired unpaid pending stays
 * here with an Expired chip, as on the old dashboard). Ended =
 * everything else: settling (budget/duration over), rejected,
 * or any other finished state. No new statuses are invented.
 */
function brandTab(c: Campaign): BrandTab {
  if (campaignStatus(c) === "live") return "live";
  if (c.status === "pending") return "pending";
  return "ended";
}

function statusChip(c: Campaign): { label: string; cls: string } {
  if (campaignStatus(c) === "live") {
    if (c.is_paused)
      return { label: "Paused", cls: "bg-yellow-500/15 text-yellow-300" };
    return { label: "Live", cls: "bg-lime/15 text-lime" };
  }
  if (c.status === "pending") {
    if (isExpiredUnpaidPending(c))
      return { label: "Expired", cls: "bg-red-500/15 text-red-300" };
    return { label: "Pending", cls: "bg-yellow-500/15 text-yellow-300" };
  }
  if (c.status === "rejected")
    return { label: "Rejected", cls: "bg-red-500/15 text-red-300" };
  return { label: "Ended", cls: "bg-fg/10 text-fg/60" };
}

export default async function BrandCampaignsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Brand pages are for brand-capable accounts only — a
  // creator-only account typing the URL goes to Discover.
  const { brandCapable } = await getModeContext();
  if (!brandCapable) redirect("/campaigns");

  const tab: BrandTab =
    searchParams?.tab === "pending" || searchParams?.tab === "ended"
      ? searchParams.tab
      : "live";

  let campaigns: Campaign[] = [];
  let statsList: (BrandCampaignStats | null)[] = [];
  let loadError = false;
  try {
    campaigns = await getBrandCampaigns(user.id);
    statsList = await Promise.all(
      campaigns.map((c) => getBrandCampaignStats(c.id).catch(() => null))
    );
  } catch {
    loadError = true;
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-red-500/40 bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-fg">
          Couldn&apos;t load your campaigns
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg/60">
          Your campaigns could not be loaded — please try again. Your
          data is safe; this is a loading problem, not an empty list.
        </p>
        <Link
          href="/brand/campaigns"
          className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
        >
          Try again
        </Link>
      </div>
    );
  }

  const statsById = new Map<string, BrandCampaignStats | null>(
    campaigns.map((c, i) => [c.id, statsList[i]])
  );
  const counts: Record<BrandTab, number> = { live: 0, pending: 0, ended: 0 };
  for (const c of campaigns) counts[brandTab(c)] += 1;
  const shown = campaigns.filter((c) => brandTab(c) === tab);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">
            My Campaigns
          </h1>
          <p className="mt-1 text-sm text-fg/60">
            Live, pending and ended campaigns for your brand.
          </p>
        </div>
        <Link
          href="/brands"
          className="inline-block rounded-full bg-lime px-6 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-limedark"
        >
          + Launch a campaign
        </Link>
      </div>

      {/* Tabs — Live / Pending / Ended, with counts. */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/brand/campaigns?tab=${t.key}`}
            className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${
              tab === t.key
                ? "bg-lime text-black"
                : "border border-fg/20 text-fg hover:border-lime hover:text-lime"
            }`}
          >
            {t.label} ({counts[t.key]})
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-fg/10 bg-card p-8 text-center">
          <p className="text-4xl" aria-hidden>
            🏢
          </p>
          <h3 className="mt-3 text-lg font-black text-fg">
            {tab === "live"
              ? "No live campaigns yet"
              : tab === "pending"
                ? "No pending campaigns"
                : "No ended campaigns yet"}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            {tab === "live"
              ? "Fund a campaign and get it verified to go live — creators can then submit clips for it."
              : tab === "pending"
                ? "Campaigns waiting for payment or admin verification show up here."
                : "Campaigns that ended or were rejected show up here."}
          </p>
          {tab !== "ended" && (
            <Link
              href="/brands"
              className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
            >
              Launch a campaign
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((c) => (
            <BrandCampaignCard
              key={c.id}
              campaign={c}
              stats={statsById.get(c.id) ?? null}
              tab={tab}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BrandCampaignCard({
  campaign: c,
  stats,
  tab,
}: {
  campaign: Campaign;
  stats: BrandCampaignStats | null;
  tab: BrandTab;
}) {
  const status = statusChip(c);
  const usedPct = Math.round(budgetUsedPct(c.budget_total, c.budget_left));
  const barCls = budgetBarClass(usedPct);
  const spent = Math.max(0, c.budget_total - c.budget_left);
  const remaining = Math.max(0, c.budget_left);
  const paymentSubmitted = Boolean(c.payment_tx_id?.trim());
  const expired = isExpiredUnpaidPending(c);
  const needsFunding =
    c.status === "pending" && !paymentSubmitted && !expired;
  const isLive = campaignStatus(c) === "live";

  return (
    <div className="rounded-2xl border border-fg/10 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-lg font-black text-fg">
              {c.title}
            </h3>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-black ${status.cls}`}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-fg/60">
            {formatUSD(c.view_bonus_per_1k)} per 1k views
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === "pending" && needsFunding && (
            <Link
              href={`/brands/payment/${c.id}`}
              className="rounded-full bg-lime px-6 py-2.5 text-sm font-black uppercase tracking-wide text-black transition hover:bg-limedark"
            >
              Pay Now
            </Link>
          )}
          {tab === "live" && (
            <>
              <Link
                href={`/brand/campaigns/${c.id}/clips`}
                className="rounded-full bg-lime px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-limedark"
              >
                View Clips
              </Link>
              <BrandPauseButton
                campaignId={c.id}
                title={c.title}
                isPaused={Boolean(c.is_paused)}
              />
            </>
          )}
          {tab === "ended" && (
            <Link
              href={`/brand/campaigns/${c.id}/clips`}
              className="rounded-full border border-fg/20 px-4 py-2 text-xs font-bold text-fg hover:border-lime hover:text-lime"
            >
              View Clips
            </Link>
          )}
          {tab === "pending" && needsFunding && (
            <BrandDeleteButton campaignId={c.id} title={c.title} />
          )}
        </div>
      </div>

      {tab === "pending" && expired && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-300">
          <span className="font-black">Expired — create a new campaign.</span>{" "}
          This campaign was never funded within 7 days, so it expired
          and can no longer be paid for.
        </div>
      )}
      {tab === "pending" && !expired && !needsFunding && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200">
          <span className="font-black">Pending — payment submitted.</span>{" "}
          The admin is verifying your payment. Your campaign goes live
          once payment is verified.
        </div>
      )}
      {tab === "pending" && needsFunding && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200">
          <span className="font-black">Pending — not live yet.</span> Send
          your budget plus the 15% platform fee on the payment page —
          your campaign goes live only after the admin verifies your
          payment. Unpaid pending campaigns expire after 7 days.
        </div>
      )}
      {isLive && !c.is_paused && (
        <div className="mt-4 rounded-xl border border-lime/40 bg-lime/10 px-4 py-3 text-sm leading-relaxed text-lime">
          <span className="font-black">Live.</span> Creators can now
          submit clips for this campaign.
        </div>
      )}
      {isLive && c.is_paused && (
        <div className="mt-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm leading-relaxed text-yellow-200">
          <span className="font-black">Paused.</span> Hidden from
          Discover — creators cannot submit new clips until you start
          it again. Existing clips are untouched.
        </div>
      )}
      {c.status === "rejected" && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-300">
          <span className="font-black">Rejected by the admin.</span>{" "}
          This campaign will not go live.{" "}
          {paymentSubmitted && (
            <Link
              href={`/brands/payment/${c.id}`}
              className="font-bold text-lime hover:underline"
            >
              View payment / request a refund →
            </Link>
          )}
        </div>
      )}
      {campaignStatus(c) === "settling" && (
        <div className="mt-4 rounded-xl border border-fg/10 bg-fg/5 px-4 py-3 text-sm leading-relaxed text-fg/70">
          <span className="font-black text-fg">Ended — payouts in progress.</span>{" "}
          After the campaign ends there is a 3-day re-check window,
          then payouts are made manually (about 1 week after the
          campaign ends in total).
        </div>
      )}

      {/* Budget — % used bar plus the $ total, because this is the
          brand's own money. Spent = budget_total − budget_left. */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-fg/60">
          <span>Budget: {formatUSD(c.budget_total)}</span>
          <span className="font-bold text-fg">{usedPct}% used</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fg/10">
          <div
            className={`h-full rounded-full ${barCls}`}
            style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-fg/60">
          Spent {formatUSD(spent)} · Remaining {formatUSD(remaining)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-fg/5 px-2 py-3">
          <p className="text-lg font-black text-fg">
            {stats?.total_views == null
              ? "—"
              : stats.total_views.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-fg/50">Views</p>
        </div>
        <div className="rounded-xl bg-fg/5 px-2 py-3">
          <p className="text-lg font-black text-fg">
            {stats ? stats.total : "—"}
          </p>
          <p className="mt-0.5 text-xs text-fg/50">Clips</p>
        </div>
        <div className="rounded-xl bg-fg/5 px-2 py-3">
          <p className="text-lg font-black text-fg">
            {stats ? stats.approved : "—"}
          </p>
          <p className="mt-0.5 text-xs text-fg/50">Approved</p>
        </div>
      </div>

      {(tab === "pending" || c.status === "rejected") && (
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold">
          <Link
            href={`/brands/payment/${c.id}#brand-chat`}
            className="text-lime hover:underline"
          >
            Chat with admin →
          </Link>
          {c.status === "pending" && (
            <Link
              href={`/brands/payment/${c.id}#edit-campaign`}
              className="text-fg/70 hover:text-lime"
            >
              Edit details →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
