import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getProfile } from "@/lib/auth";
import {
  campaignStatus,
  getBrandCampaigns,
  getBrandCampaignStats,
  getCampaignRejectionReason,
  getUserSubmissions,
  getWallet,
  isExpiredUnpaidPending,
  type BrandCampaignStats,
} from "@/lib/data";
import { getServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import MyPostsList from "@/components/MyPostsList";
import CopyButton from "@/components/CopyButton";
import SignOutButton from "@/components/SignOutButton";
import { SITE_URL } from "@/lib/constants";
import { budgetBarClass, budgetUsedPct, formatUSD } from "@/lib/money";
import type { User } from "@supabase/supabase-js";
import { type Campaign, type UserProfile } from "@/lib/types";

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
  // Forms #26: a failed load renders an honest error state, never
  // the empty dashboard. getWallet returns null on error (no row /
  // cannot compute); getUserSubmissions THROWS on DB error.
  let submissions: Awaited<ReturnType<typeof getUserSubmissions>> = [];
  let loadError = false;
  try {
    submissions = await getUserSubmissions(user.id);
  } catch {
    loadError = true;
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-red-500/40 bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-fg">
          Couldn&apos;t load the dashboard
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg/60">
          Your posts could not be loaded — please try again. Your data
          is safe; this is a loading problem, not an empty dashboard.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
        >
          Try again
        </Link>
      </div>
    );
  }

  // The creator's name, never "Guest" for a logged-in user: the
  // profile row (migration 0005) first, then the signup metadata
  // (saved before the migration runs), then the email.
  const metaName = user.user_metadata?.full_name;
  const displayName =
    profile?.full_name ??
    (typeof metaName === "string" && metaName.trim() ? metaName : null) ??
    user.email ??
    "Creator";

  const totalViews = submissions
    .filter((s) => s.status !== "rejected")
    .reduce((s, x) => s + x.views, 0);
  // "Total earned (all time)" comes from the WALLET, not from the
  // submissions list: auto-delete removes a campaign's submissions
  // after settlement, so a submissions sum silently drops after
  // cleanup. Wallet balances persist — available + pending +
  // withdrawn_total is every approved earning ever (a withdrawal
  // moves available → withdrawn, so the sum is stable across
  // auto-delete). Fall back to the submissions sum only when no
  // wallet row exists yet.
  const walletLifetime =
    wallet === null
      ? null
      : wallet.available_balance +
        wallet.pending_balance +
        wallet.withdrawn_total;
  const totalEarned =
    walletLifetime ?? submissions.reduce((s, x) => s + x.earnings, 0);

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
          <p className="text-xs text-fg/50">Total earned (all time)</p>
          <p className="mt-1 text-2xl font-black text-fg">
            {formatUSD(totalEarned)}
          </p>
          <p className="mt-1 text-xs text-fg/50">
            Lifetime earnings from approved clips, including amounts
            already withdrawn.
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
  // Forms #26: a failed load renders an honest error state, never
  // an empty campaign list. getBrandCampaigns THROWS on DB error;
  // getBrandCampaignStats returns null when it cannot compute.
  let campaigns: Campaign[] = [];
  let statsList: (BrandCampaignStats | null)[] = [];
  let loadError = false;
  try {
    campaigns = await getBrandCampaigns(user.id);
    statsList = await Promise.all(
      campaigns.map((c) => getBrandCampaignStats(c.id))
    );
  } catch {
    loadError = true;
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-red-500/40 bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-fg">
          Couldn&apos;t load the dashboard
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg/60">
          Your campaigns could not be loaded — please try again. Your
          data is safe; this is a loading problem, not an empty
          dashboard.
        </p>
        <Link
          href="/dashboard"
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
  // Rejection reasons for rejected campaigns, read back from
  // each campaign's brand chat thread (the admin posts the reason
  // there on reject — there is no rejection_reason column on
  // campaigns). Only rejected campaigns are looked up.
  const rejectionReasons = new Map<string, string>();
  for (const c of campaigns) {
    if (c.status !== "rejected") continue;
    const reason = await getCampaignRejectionReason(c.id);
    if (reason) rejectionReasons.set(c.id, reason);
  }
  // Unread admin replies (round-3 P1-8): the brand chat notifies
  // nobody, so the dashboard card carries the badge instead.
  // brand_messages.is_read is the ADMIN's read marker — the
  // admin-only PATCH marks every message in a thread read, so it
  // cannot say whether the BRAND saw a reply. The badge rule
  // instead: an admin message newer than the brand's latest
  // message in that thread (an admin reply the brand has not
  // answered since — a brand with no messages yet counts any
  // admin message as unread). The badge clears when the brand
  // replies; merely opening the chat does not clear it yet — a
  // brand-side mark-read needs a messages-route change (not in
  // this batch). Best-effort: a failed chat read shows no badge
  // rather than breaking the dashboard.
  const unreadAdminReplyById = new Map<string, boolean>();
  if (campaigns.length > 0) {
    try {
      const supabase = getServerClient();
      if (supabase) {
        const { data: chatRows } = await supabase
          .from("brand_messages")
          .select("campaign_id, sender, created_at")
          .in(
            "campaign_id",
            campaigns.map((c) => c.id)
          )
          .order("created_at", { ascending: true });
        const byCampaign = new Map<
          string,
          { sender: string; created_at: string }[]
        >();
        for (const row of (chatRows ?? []) as {
          campaign_id: string;
          sender: string;
          created_at: string;
        }[]) {
          const list = byCampaign.get(row.campaign_id) ?? [];
          list.push(row);
          byCampaign.set(row.campaign_id, list);
        }
        for (const [campaignId, thread] of byCampaign) {
          const lastBrandAt = Math.max(
            0,
            ...thread
              .filter((m) => m.sender === "brand")
              .map((m) => new Date(m.created_at).getTime())
          );
          const unread = thread.some(
            (m) =>
              m.sender === "admin" &&
              new Date(m.created_at).getTime() > lastBrandAt
          );
          if (unread) unreadAdminReplyById.set(campaignId, true);
        }
      }
    } catch {
      // No badge — the dashboard still loads.
    }
  }

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
                rejectionReason={rejectionReasons.get(c.id) ?? null}
                hasUnreadAdminReply={unreadAdminReplyById.get(c.id) ?? false}
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
  rejectionReason,
  hasUnreadAdminReply = false,
}: {
  campaign: Campaign;
  stats: BrandCampaignStats | null;
  rejectionReason?: string | null;
  hasUnreadAdminReply?: boolean;
}) {
  const status = brandStatus(c);
  const usedPct = Math.round(budgetUsedPct(c.budget_total, c.budget_left));
  // SAME thresholds as the public card (item 28): <50% lime,
  // 50–75% yellow, 75–90% red, >90% dark red.
  const barCls = budgetBarClass(usedPct);
  const rate = c.view_bonus_per_1k;
  // "Payment submitted" keys off payment_tx_id, NOT is_funded:
  // is_funded only becomes true at approve time, so keying off it
  // made "payment submitted" unreachable and kept showing the
  // "Fund this campaign" button after the brand already paid. A
  // non-empty TxID means the payment was submitted and the admin
  // is verifying it.
  const paymentSubmitted = Boolean(c.payment_tx_id?.trim());
  // Round-3 P1-6: an expired unpaid pending (7+ days, no TxID)
  // no longer invites payment — no Fund button, expired state.
  const expired = isExpiredUnpaidPending(c);
  const needsFunding = c.status === "pending" && !paymentSubmitted && !expired;

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
            {hasUnreadAdminReply && (
              <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-black text-white">
                New reply from admin
              </span>
            )}
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
          {/* Round-3 P2-11: the admin chat lives on the payment
              page for every status — a live or rejected campaign
              used to have no link to it at all. */}
          <Link
            href={`/brands/payment/${c.id}#brand-chat`}
            className="rounded-full border border-fg/20 px-4 py-2 text-xs font-bold text-fg hover:border-lime hover:text-lime"
          >
            Chat with admin
            {hasUnreadAdminReply ? " •" : ""}
          </Link>
          <Link
            href={`/campaign/${c.id}`}
            className="rounded-full border border-fg/20 px-4 py-2 text-xs font-bold text-fg hover:border-lime hover:text-lime"
          >
            View campaign
          </Link>
        </div>
      </div>

      {/* Status banner: the brand always sees clearly where its
          campaign stands and what happens next. */}
      {c.status === "pending" && expired && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-300">
          <span className="font-black">Expired — create a new campaign.</span>{" "}
          This campaign was never funded within 7 days, so it expired
          and can no longer be paid for. Create a new campaign to
          start again.
        </div>
      )}
      {c.status === "pending" && !expired && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200">
          <span className="font-black">Pending — not live yet.</span>{" "}
          {needsFunding ? (
            <>
              Send your budget plus the 15% platform fee on the payment
              page — your campaign goes live only after the admin
              verifies your payment. Unpaid pending campaigns expire
              after 7 days; chatting alone does not count as payment.
            </>
          ) : (
            <>
              Your payment was submitted — the admin is verifying it.
              Your campaign goes live once payment is verified.
            </>
          )}
        </div>
      )}
      {c.status === "rejected" && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-300">
          <span className="font-black">Rejected by the admin.</span>{" "}
          {rejectionReason ? (
            <>
              Reason: <span className="font-bold">{rejectionReason}</span>{" "}
            </>
          ) : (
            <>This campaign will not go live. </>
          )}
          If you already sent the budget, contact the admin on
          Discord about your refund.
        </div>
      )}
      {campaignStatus(c) === "live" && (
        <div className="mt-4 rounded-xl border border-lime/40 bg-lime/10 px-4 py-3 text-sm leading-relaxed text-lime">
          <span className="font-black">Live.</span> Creators can now
          submit clips for this campaign.
        </div>
      )}
      {campaignStatus(c) === "settling" && (
        <div className="mt-4 rounded-xl border border-fg/10 bg-fg/5 px-4 py-3 text-sm leading-relaxed text-fg/70">
          <span className="font-black text-fg">Ended — payouts in progress.</span>{" "}
          Approved earnings enter a 72-hour hold as soon as they are
          approved — even while the campaign is still running. After
          the campaign ends there is a 3-day re-check window, then
          payouts are made manually (about 1 week after the campaign
          ends in total). The campaign, its proofs and its chat are
          deleted 1 day after the last hold matures, never earlier
          than 7 days after the campaign ends. Wallet and withdrawal
          records are never deleted.
        </div>
      )}

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
