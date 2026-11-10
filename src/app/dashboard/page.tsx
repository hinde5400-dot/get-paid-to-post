import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getProfile } from "@/lib/auth";
import {
  campaignStatus,
  getBrandCampaigns,
  getBrandCampaignStats,
  getUserSubmissions,
  getWallet,
  type BrandCampaignStats,
} from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import MyPostsList from "@/components/MyPostsList";
import CopyButton from "@/components/CopyButton";
import SignOutButton from "@/components/SignOutButton";
import { SITE_URL } from "@/lib/constants";
import { budgetUsedPct, formatUSD } from "@/lib/money";
import type { User } from "@supabase/supabase-js";
import { maxRatePer1k, type Campaign, type UserProfile } from "@/lib/types";

export default async function DashboardPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-fg/10 bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-fg">Dashboard</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg/60">
          Supabase is not configured yet. Add{" "}
          <code className="text-lime">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-lime">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
          <code className="text-lime">.env.local</code> and restart the server —
          see the README for the exact steps.
        </p>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);

  // Brands never see the creator dashboard: they get their own
  // campaigns (with a Create button) and no earnings cards.
  // public.users.role is the single source of truth (see the
  // brands page) — auth metadata is user-writable and never
  // decides a role.
  if ((profile?.role ?? "creator") === "brand") {
    return <BrandDashboard user={user} profile={profile} />;
  }

  const wallet = await getWallet(user.id);
  const submissions = await getUserSubmissions(user.id);

  // The creator's name, never "Guest" for a logged-in user: the
  // profile row (migration 0005) first, then the signup metadata
  // (saved before the migration runs), then the email.
  const metaName = user.user_metadata?.full_name;
  const displayName =
    profile?.full_name ??
    (typeof metaName === "string" && metaName.trim() ? metaName : null) ??
    user.email ??
    "Creator";

  const totalViews = submissions.reduce((s, x) => s + x.views, 0);
  const totalEarned = submissions.reduce((s, x) => s + x.earnings, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Dashboard</h1>
        <p className="mt-1 text-sm text-fg/60">Welcome back, {displayName}</p>
      </div>

      {/* Profile — the creator's name and a way out. */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-fg/10 bg-card p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime/15 font-display text-xl font-black text-lime">
          {displayName[0].toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-black text-fg">
            {displayName}
          </p>
          <p className="truncate text-sm text-fg/60">{user.email}</p>
        </div>
        <SignOutButton />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-fg/10 bg-card p-5">
          <p className="text-xs text-fg/50">Total Earned</p>
          <p className="mt-1 text-2xl font-black text-fg">
            {formatUSD(totalEarned)}
          </p>
        </div>
        <div className="rounded-2xl border border-fg/10 bg-card p-5">
          <p className="text-xs text-fg/50">Pending Balance</p>
          <p className="mt-1 text-2xl font-black text-fg">
            {formatUSD(wallet?.pending_balance ?? 0)}
          </p>
          <p className="mt-1 text-xs text-fg/50">
            Approved earnings become available after 72-hour hold.
          </p>
        </div>
        <div className="rounded-2xl border border-fg/10 bg-card p-5">
          <p className="text-xs text-fg/50">Withdrawable Balance</p>
          <p className="mt-1 text-2xl font-black text-lime">
            {formatUSD(wallet?.available_balance ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-fg/10 bg-card p-5">
          <p className="text-xs text-fg/50">Total views</p>
          <p className="mt-1 text-2xl font-black text-fg">
            {totalViews.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/campaigns"
          className="rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-ink"
        >
          Find a campaign
        </Link>
        <Link
          href="/earnings"
          className="rounded-full border border-fg/20 px-5 py-2.5 text-sm font-bold text-fg hover:border-lime hover:text-lime"
        >
          Earnings &amp; withdrawals
        </Link>
        <Link
          href="/connect"
          className="rounded-full border border-fg/20 px-5 py-2.5 text-sm font-bold text-fg hover:border-lime hover:text-lime"
        >
          My accounts
        </Link>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-extrabold text-fg">My Posts</h2>
        <MyPostsList submissions={submissions} />
      </section>

      <section
        id="refer"
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-lime/40 bg-card p-5"
      >
        <div>
          <h2 className="font-display text-lg font-black uppercase tracking-tight text-fg">
            Refer a friend
          </h2>
          <p className="mt-1 max-w-md text-sm text-fg/60">
            Know a creator who should get paid for their clips? Share the
            site link with them.
          </p>
          <p className="mt-2 truncate rounded-lg bg-ink px-3 py-2 text-sm font-bold text-lime">
            {SITE_URL}
          </p>
        </div>
        <CopyButton text={SITE_URL} />
      </section>
    </div>
  );
}

/**
 * Brand dashboard — a brand's own campaigns, never creator
 * earnings. Status is Pending (waiting on admin review / payment),
 * Live (funded and running) or Ended (budget spent or duration
 * over, still in its settlement window). Budget is shown as % used
 * with the $ budget total — this is the brand's own private view
 * of its own money, not a public card. Views show "—" while the
 * total cannot be read for a brand (see getBrandCampaignStats).
 */
async function BrandDashboard({
  user,
  profile,
}: {
  user: User;
  profile: UserProfile | null;
}) {
  const campaigns = await getBrandCampaigns(user.id);
  const statsList = await Promise.all(
    campaigns.map((c) => getBrandCampaignStats(c.id))
  );
  const statsById = new Map<string, BrandCampaignStats | null>(
    campaigns.map((c, i) => [c.id, statsList[i]])
  );

  const metaName = user.user_metadata?.full_name;
  const displayName =
    profile?.brand_name ??
    profile?.full_name ??
    (typeof metaName === "string" && metaName.trim() ? metaName : null) ??
    user.email ??
    "Brand";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Dashboard</h1>
        <p className="mt-1 text-sm text-fg/60">Welcome back, {displayName}</p>
      </div>

      {/* Profile — the brand's name and a way out. */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-fg/10 bg-card p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime/15 font-display text-xl font-black text-lime">
          {displayName[0].toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-black text-fg">
            {displayName}
          </p>
          <p className="truncate text-sm text-fg/60">{user.email}</p>
        </div>
        <SignOutButton />
      </div>

      <div>
        <Link
          href="/brands"
          className="inline-block rounded-full bg-lime px-6 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-limedark"
        >
          + Create a campaign
        </Link>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-extrabold text-fg">My Campaigns</h2>
        {campaigns.length === 0 ? (
          <div className="rounded-2xl border border-fg/10 bg-card p-8 text-center">
            <p className="text-4xl" aria-hidden>
              🏢
            </p>
            <h3 className="mt-3 text-lg font-black text-fg">
              You haven&apos;t launched a campaign yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
              Fund a budget and pay only for verified views. Your campaign
              goes live once payment is verified.
            </p>
            <Link
              href="/brands"
              className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
            >
              Create your first campaign
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((c) => (
              <BrandCampaignCard
                key={c.id}
                campaign={c}
                stats={statsById.get(c.id) ?? null}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function brandStatus(c: Campaign): { label: string; cls: string } {
  const s = campaignStatus(c);
  if (s === "live")
    return { label: "Live", cls: "bg-lime/15 text-lime" };
  if (s === "settling")
    return { label: "Ended", cls: "bg-fg/10 text-fg/60" };
  if (c.status === "rejected")
    return { label: "Rejected", cls: "bg-red-500/15 text-red-300" };
  return { label: "Pending", cls: "bg-yellow-500/15 text-yellow-300" };
}

function BrandCampaignCard({
  campaign: c,
  stats,
}: {
  campaign: Campaign;
  stats: BrandCampaignStats | null;
}) {
  const status = brandStatus(c);
  const usedPct = Math.round(budgetUsedPct(c.budget_total, c.budget_left));
  const barCls =
    usedPct >= 100
      ? "bg-red-500"
      : usedPct >= 50
        ? "bg-yellow-400"
        : "bg-lime";
  const rate = maxRatePer1k(c);
  const needsFunding = c.status === "pending" && !c.is_funded;

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
            {formatUSD(rate)} per 1k views
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {needsFunding && (
            <Link
              href={`/brands/payment/${c.id}`}
              className="rounded-full bg-lime px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-limedark"
            >
              Fund this campaign
            </Link>
          )}
          <Link
            href={`/campaign/${c.id}`}
            className="rounded-full border border-fg/20 px-4 py-2 text-xs font-bold text-fg hover:border-lime hover:text-lime"
          >
            View campaign
          </Link>
        </div>
      </div>

      {/* Budget — % used bar (same rule as public cards) plus the
          $ total, because this is the brand's own money. */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-fg/60">
          <span>
            Budget: {formatUSD(c.budget_total)}
          </span>
          <span className="font-bold text-fg">{usedPct}% used</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fg/10">
          <div
            className={`h-full rounded-full ${barCls}`}
            style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }}
          />
        </div>
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
          <p className="mt-0.5 text-xs text-fg/50">Submissions</p>
        </div>
        <div className="rounded-xl bg-fg/5 px-2 py-3">
          <p className="text-lg font-black text-fg">
            {stats ? stats.approved : "—"}
          </p>
          <p className="mt-0.5 text-xs text-fg/50">Approved</p>
        </div>
      </div>
    </div>
  );
}
