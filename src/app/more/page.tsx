import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getModeContext } from "@/lib/mode";
import { getWallet } from "@/lib/data";
import { formatUSD } from "@/lib/money";
import SignOutButton from "@/components/SignOutButton";
import ModeSwitch from "@/components/ModeSwitch";

export const metadata: Metadata = {
  title: "More",
  description:
    "Your account, earnings and settings on Get Paid To Post — campaigns, connected accounts, stats and support in one place.",
};

const LINKS = [
  { href: "/campaigns", label: "Campaigns", icon: "◎", desc: "Browse funded campaigns" },
  { href: "/connect", label: "My accounts", icon: "🔗", desc: "TikTok & YouTube logins, Instagram profile link" },
  { href: "/how-it-works", label: "How It Works & FAQ", icon: "?", desc: "Learn how earning works" },
  { href: "/dashboard", label: "Stats", icon: "▤", desc: "Your views and earnings" },
  { href: "/earnings", label: "Earnings", icon: "$", desc: "Balance, hold & withdrawals" },
  { href: "/support", label: "Contact Support", icon: "✉", desc: "Discord support" },
];

export default async function MorePage() {
  // Mode context is cached per request — one auth + profile read
  // shared with the layout/Navbar.
  const { user, profile, mode, canSwitch } = await getModeContext();
  // Brand mode never sees the creator More page — brands have
  // Brand Profile instead.
  if (user && mode === "brand") redirect("/brand/profile");
  const wallet = user ? await getWallet(user.id) : null;
  const metaName = user?.user_metadata?.full_name;
  const displayName =
    profile?.full_name ??
    (typeof metaName === "string" && metaName.trim() ? metaName : null) ??
    user?.email ??
    "Creator";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">
        More
      </h1>

      {/* Profile — name + avatar + logout for logged-in users. */}
      {user && (
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
      )}

      {/* Mode switch — every signed-in user can switch modes,
          either way, one click (Turn 2026-11-14). */}
      {user && canSwitch && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-fg/10 bg-card p-5">
          <div>
            <p className="font-bold text-fg">You also have a brand account</p>
            <p className="mt-0.5 text-sm text-fg/60">
              Switch to manage your campaigns instead of your clips.
            </p>
          </div>
          <ModeSwitch mode="creator" />
        </div>
      )}

      {/* Balance hero */}
      {user ? (
        <div className="overflow-hidden rounded-3xl bg-lime p-6 text-black">
          <p className="text-xs font-black uppercase tracking-widest text-black/60">
            Your balance
          </p>
          <p className="mt-1 font-display text-4xl font-black tracking-tight">
            {formatUSD(wallet?.available_balance ?? 0)}
          </p>
          <p className="mt-1 text-sm font-semibold text-black/70">
            {formatUSD(wallet?.pending_balance ?? 0)} pending in 72-hour hold
          </p>
          <Link
            href="/earnings"
            className="mt-4 inline-block rounded-full bg-black px-5 py-2.5 text-sm font-black text-white transition hover:bg-black/80"
          >
            Go to Earnings →
          </Link>
        </div>
      ) : (
        <div className="rounded-3xl border border-fg/10 bg-card p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-fg/50">
            Your balance
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg/60">
            Log in to see your balance and earnings.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-black text-black transition hover:bg-limedark"
          >
            Log in
          </Link>
        </div>
      )}

      {/* Link cards */}
      <div>
        <h2 className="mb-3 font-display text-base font-black uppercase tracking-tight text-fg">
          Account
        </h2>
        <div className="overflow-hidden rounded-3xl border border-fg/10 bg-card">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-center gap-4 border-b border-fg/5 px-5 py-4 transition last:border-0 hover:bg-fg/5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime/15 font-display text-lg font-black text-limeink">
                {l.icon}
              </span>
              <span>
                <span className="block font-bold text-fg">{l.label}</span>
                <span className="block text-xs text-fg/50">{l.desc}</span>
              </span>
              <span className="ml-auto text-fg/40">›</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-fg/10 bg-card p-5 text-center">
        <p className="text-sm font-bold text-fg">New here?</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-fg/50">
          Pick a funded campaign, post your clip, get paid per view. No
          follower minimum.
        </p>
        <Link
          href="/how-it-works"
          className="mt-3 inline-block text-sm font-bold text-limeink hover:underline"
        >
          How it works →
        </Link>
      </div>

      <div className="text-center text-xs leading-relaxed text-fg/40">
        <Link href="/terms" className="hover:text-limeink">Terms</Link>
        {" · "}
        <Link href="/rules" className="hover:text-limeink">Rules</Link>
        {" · "}
        <Link href="/privacy" className="hover:text-limeink">Privacy</Link>
        {" · "}
        <Link href="/how-it-works" className="hover:text-limeink">How It Works</Link>
      </div>
    </div>
  );
}
