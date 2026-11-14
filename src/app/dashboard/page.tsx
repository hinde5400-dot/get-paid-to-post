import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getModeContext } from "@/lib/mode";
import {
  getUserNotifications,
  getUserSubmissions,
  getWallet,
} from "@/lib/data";
import { getServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import MyPostsList, {
  type CampaignHistoryRow,
} from "@/components/MyPostsList";
import NotificationsPanel from "@/components/NotificationsPanel";
import CopyButton from "@/components/CopyButton";
import SignOutButton from "@/components/SignOutButton";
import { SITE_URL } from "@/lib/constants";
import { formatUSD } from "@/lib/money";

export default async function DashboardPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-fg/10 bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-fg">Dashboard</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg/60">
          Supabase is not configured yet. Add{" "}
          <code className="text-limeink">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-limeink">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
          <code className="text-limeink">.env.local</code> and restart the server —
          see the README for the exact steps.
        </p>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Brand mode never sees the creator dashboard — brands live in
  // My Campaigns (/brand/campaigns). A brand-role user who also
  // posts clips and switches to creator mode lands here instead.
  // Mode context is cached per request — one auth + profile read
  // shared with the layout/Navbar.
  const { mode, profile } = await getModeContext();
  if (mode === "brand") redirect("/brand/campaigns");

  // Strict mode separation (Turn 2026-11-14): creator mode ALWAYS
  // shows the creator dashboard — earnings, views and the user's
  // own posts. A brand-role user who switched to creator mode sees
  // their creator side (possibly empty); their brand side lives in
  // My Campaigns (/brand/campaigns) in brand mode. The old
  // BrandDashboard that used to render here is gone — it duplicated
  // /brand/campaigns and leaked brand content into creator mode.

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
  // Round-4 P2-C1: the creator dashboard embeds the same list as
  // /my-posts, so it passes the same past-campaigns history —
  // without it the dashboard always said "No past campaigns yet".
  const pastCampaigns = await getUserCampaignHistory(user.id);
  // In-app notifications (admin tabs, migration 0049): a
  // withdrawal marked Paid, a creator Warning. Best-effort —
  // a missing table returns [] and the panel hides.
  const notifications = await getUserNotifications(user.id);
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
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime/15 font-display text-xl font-black text-limeink">
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
          <p className="mt-1 text-2xl font-black text-limeink">
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
          className="rounded-full border border-fg/20 px-5 py-2.5 text-sm font-bold text-fg hover:border-lime hover:text-limeink"
        >
          Earnings &amp; withdrawals
        </Link>
        <Link
          href="/connect"
          className="rounded-full border border-fg/20 px-5 py-2.5 text-sm font-bold text-fg hover:border-lime hover:text-limeink"
        >
          My accounts
        </Link>
      </div>

      {/* Notifications (admin tabs): withdrawal Paid notices and
          creator warnings land here. Hidden when empty. */}
      <NotificationsPanel notifications={notifications} />

      <section>
        <h2 className="mb-4 text-xl font-extrabold text-fg">My Posts</h2>
        <MyPostsList submissions={submissions} pastCampaigns={pastCampaigns} />
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
          <p className="mt-2 truncate rounded-lg bg-ink px-3 py-2 text-sm font-bold text-limeink">
            {SITE_URL}
          </p>
        </div>
        <CopyButton text={SITE_URL} />
      </section>
    </div>
  );
}

/**
 * Participant history (migration 0027): the logged-in creator's own
 * rows only — same loader as /my-posts (see src/app/my-posts/
 * page.tsx). Returns [] when the table doesn't exist yet or on any
 * error, so the page still renders with the honest empty state.
 */
async function getUserCampaignHistory(
  userId: string
): Promise<CampaignHistoryRow[]> {
  const supabase = getServerClient();
  if (!supabase) return [];
  // Round-6 C5: page in 1,000-row chunks — an unpaged select
  // silently caps at 1,000 rows (PostgREST default), so past 1,000
  // history rows the oldest ones vanished from the dashboard.
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("campaign_history")
      .select(
        "id, campaign_id, campaign_title, brand_name, platforms, joined_at, clips_submitted, clips_approved, total_views, total_earned, status"
      )
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .range(offset, offset + 999);
    if (error || !data) return [];
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < 1000) break;
  }
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    campaign_id: (row.campaign_id as string | null) ?? null,
    campaign_title: (row.campaign_title as string | null) ?? null,
    brand_name: (row.brand_name as string | null) ?? null,
    platforms: Array.isArray(row.platforms)
      ? (row.platforms as string[])
      : null,
    joined_at: (row.joined_at as string | null) ?? null,
    clips_submitted: Number(row.clips_submitted ?? 0),
    clips_approved: Number(row.clips_approved ?? 0),
    total_views: Number(row.total_views ?? 0),
    total_earned: Number(row.total_earned ?? 0),
    status: String(row.status ?? "completed"),
  }));
}

