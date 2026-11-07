import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getProfile } from "@/lib/auth";
import { getUserSubmissions, getWallet } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import MyPostsList from "@/components/MyPostsList";
import { formatUSD } from "@/lib/money";

export default async function DashboardPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-card p-8 text-center">
        <h1 className="text-2xl font-black text-white">Dashboard</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Supabase is not configured yet. Add{" "}
          <code className="text-sun">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-sun">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
          <code className="text-sun">.env.local</code> and restart the server —
          see the README for the exact steps.
        </p>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  const wallet = await getWallet(user.id);
  const submissions = await getUserSubmissions(user.id);

  const totalViews = submissions.reduce((s, x) => s + x.views, 0);
  const totalEarned = submissions.reduce((s, x) => s + x.earnings, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-white/60">
          Welcome back, {profile?.email ?? user.email}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-card p-5">
          <p className="text-xs text-white/50">Available balance</p>
          <p className="mt-1 text-2xl font-black text-sun">
            {formatUSD(wallet?.available_balance ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-5">
          <p className="text-xs text-white/50">Pending (72-hour hold)</p>
          <p className="mt-1 text-2xl font-black text-white">
            {formatUSD(wallet?.pending_balance ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-5">
          <p className="text-xs text-white/50">Total views</p>
          <p className="mt-1 text-2xl font-black text-white">
            {totalViews.toLocaleString()}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-5">
          <p className="text-xs text-white/50">Total earned</p>
          <p className="mt-1 text-2xl font-black text-white">
            {formatUSD(totalEarned)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/campaigns"
          className="rounded-full bg-sun px-5 py-2.5 text-sm font-bold text-ink"
        >
          Find a campaign
        </Link>
        <Link
          href="/earnings"
          className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-bold text-white hover:border-sun hover:text-sun"
        >
          Earnings &amp; withdrawals
        </Link>
        <Link
          href="/connect"
          className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-bold text-white hover:border-sun hover:text-sun"
        >
          My accounts
        </Link>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">My Posts</h2>
        <MyPostsList submissions={submissions} />
      </section>
    </div>
  );
}
