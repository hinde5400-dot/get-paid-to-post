import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getProfile } from "@/lib/auth";
import { getModeContext } from "@/lib/mode";
import { getBrandCampaigns } from "@/lib/data";
import SignOutButton from "@/components/SignOutButton";
import ModeSwitch from "@/components/ModeSwitch";

export const metadata: Metadata = {
  title: "Brand Profile",
  description: "Your brand name, logo and email — and log out.",
};

/**
 * Brand Profile: brand name, logo, email, logout — plus the mode
 * switch when this account is both a creator and a brand.
 * The logo comes from the brand's own campaigns (the newest one
 * with a logo); there is no separate brand-logo field on the
 * user row, so no logo is invented when there is none — the
 * initial avatar shows instead.
 */
export default async function BrandProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { brandCapable, canSwitch } = await getModeContext();
  if (!brandCapable) redirect("/campaigns");

  const profile = await getProfile(user.id);
  const metaName = user.user_metadata?.full_name;
  const displayName =
    profile?.brand_name ??
    profile?.full_name ??
    (typeof metaName === "string" && metaName.trim() ? metaName : null) ??
    user.email ??
    "Brand";

  let logoUrl: string | null = null;
  let campaignCount = 0;
  try {
    const campaigns = await getBrandCampaigns(user.id);
    campaignCount = campaigns.length;
    logoUrl =
      campaigns.find((c) => Boolean(c.logo_url?.trim()))?.logo_url ?? null;
  } catch {
    logoUrl = null;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">
        Brand Profile
      </h1>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-fg/10 bg-card p-5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={`${displayName} logo`}
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lime/15 font-display text-xl font-black text-lime">
            {displayName[0].toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-black text-fg">
            {displayName}
          </p>
          <p className="truncate text-sm text-fg/60">{user.email}</p>
          <p className="mt-0.5 text-xs text-fg/50">
            {campaignCount} campaign{campaignCount === 1 ? "" : "s"}
          </p>
        </div>
        <SignOutButton />
      </div>

      {/* Mode switch — only when this account is both a creator
          and a brand (owns campaigns and has submissions). */}
      {canSwitch && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-fg/10 bg-card p-5">
          <div>
            <p className="font-bold text-fg">You also post as a creator</p>
            <p className="mt-0.5 text-sm text-fg/60">
              Switch to post clips and track your earnings instead.
            </p>
          </div>
          <ModeSwitch mode="brand" />
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-fg/10 bg-card">
        <Link
          href="/brand/campaigns"
          className="flex items-center gap-4 border-b border-fg/5 px-5 py-4 transition last:border-0 hover:bg-fg/5"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime/15 font-display text-lg font-black text-lime">
            🏢
          </span>
          <span>
            <span className="block font-bold text-fg">My Campaigns</span>
            <span className="block text-xs text-fg/50">
              Live, pending and ended campaigns
            </span>
          </span>
          <span className="ml-auto text-fg/40">›</span>
        </Link>
        <Link
          href="/brand/payments"
          className="flex items-center gap-4 border-b border-fg/5 px-5 py-4 transition last:border-0 hover:bg-fg/5"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime/15 font-display text-lg font-black text-lime">
            $
          </span>
          <span>
            <span className="block font-bold text-fg">Payments</span>
            <span className="block text-xs text-fg/50">
              What you paid and whether it is verified
            </span>
          </span>
          <span className="ml-auto text-fg/40">›</span>
        </Link>
        <Link
          href="/support"
          className="flex items-center gap-4 border-b border-fg/5 px-5 py-4 transition last:border-0 hover:bg-fg/5"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime/15 font-display text-lg font-black text-lime">
            💬
          </span>
          <span>
            <span className="block font-bold text-fg">Contact Support</span>
            <span className="block text-xs text-fg/50">Discord support</span>
          </span>
          <span className="ml-auto text-fg/40">›</span>
        </Link>
      </div>

      <div className="text-center text-xs leading-relaxed text-fg/40">
        <Link href="/terms" className="hover:text-lime">Terms</Link>
        {" · "}
        <Link href="/rules" className="hover:text-lime">Rules</Link>
        {" · "}
        <Link href="/privacy" className="hover:text-lime">Privacy</Link>
        {" · "}
        <Link href="/how-it-works" className="hover:text-lime">How It Works</Link>
      </div>
    </div>
  );
}
