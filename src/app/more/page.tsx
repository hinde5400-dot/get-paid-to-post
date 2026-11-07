import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getWallet } from "@/lib/data";
import { formatUSD } from "@/lib/money";

const LINKS = [
  { href: "/campaigns", label: "Campaigns", icon: "C", desc: "Browse funded campaigns" },
  { href: "/connect", label: "My accounts", icon: "🔗", desc: "TikTok, Instagram & YouTube links" },
  { href: "/how-it-works", label: "Academy & FAQ", icon: "?", desc: "Learn how earning works" },
  { href: "/dashboard", label: "Stats", icon: "S", desc: "Your views and earnings" },
  { href: "/earnings", label: "Earnings", icon: "$", desc: "Balance, hold & withdrawals" },
  { href: "/support", label: "Contact Support", icon: "✉", desc: "Discord support" },
];

export default async function MorePage() {
  const user = await getCurrentUser();
  const wallet = user ? await getWallet(user.id) : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-white">More</h1>

      <div className="rounded-3xl border border-white/10 bg-card p-6">
        <p className="text-xs text-white/50">Your balance</p>
        {user ? (
          <>
            <p className="mt-1 text-3xl font-black text-sun">
              {formatUSD(wallet?.available_balance ?? 0)}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {formatUSD(wallet?.pending_balance ?? 0)} pending in 72-hour hold
            </p>
            <Link
              href="/earnings"
              className="mt-4 inline-block rounded-full bg-sun px-5 py-2.5 text-sm font-bold text-ink"
            >
              Go to Earnings
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-white/60">
              Log in to see your balance and earnings.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded-full bg-sun px-5 py-2.5 text-sm font-bold text-ink"
            >
              Log in
            </Link>
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-card">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center gap-4 border-b border-white/5 px-5 py-4 transition last:border-0 hover:bg-white/5"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sun/15 font-display text-lg font-black text-sun">{l.icon}</span>
            <span>
              <span className="block font-bold text-white">{l.label}</span>
              <span className="block text-xs text-white/50">{l.desc}</span>
            </span>
            <span className="ml-auto text-white/40">›</span>
          </Link>
        ))}
      </div>

      <div className="text-center text-xs leading-relaxed text-white/40">
        <Link href="/terms" className="hover:text-sun">Terms</Link>
        {" · "}
        <Link href="/privacy" className="hover:text-sun">Privacy</Link>
        {" · "}
        <Link href="/how-it-works" className="hover:text-sun">How It Works</Link>
      </div>
    </div>
  );
}
