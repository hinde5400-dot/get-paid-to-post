import Link from "next/link";
import { BRAND_NAME, SITE_DOMAIN } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";
import Logo from "./Logo";
import DiscordButton from "./DiscordButton";

/**
 * Site footer. 2026-11-16 (P2): the link sets used to differ by
 * mode — brand mode hid Campaigns/Earnings, creator mode hid
 * "For Brands" — so the footer looked different depending on
 * where you stood. The footer now shows the same links in both
 * modes: it is a sitemap, not navigation, and the pages
 * themselves enforce the mode split (a brand user opening
 * /campaigns is redirected to My Campaigns with an explanation).
 */
export default async function Footer() {
  const user = await getCurrentUser();

  return (
    <footer className="border-t border-fg/10 bg-card/60 pb-24 md:pb-8">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-2 text-sm text-fg/60">
            Post Clips. Get Paid Per View. Creators post short clips on
            TikTok, Instagram and YouTube and get paid per view. No follower
            minimum.
          </p>
          <p className="mt-3 text-xs text-fg/40">{SITE_DOMAIN}</p>
          <DiscordButton compact className="mt-4" />
        </div>
        <div>
          <p className="text-sm font-bold text-fg">Creators</p>
          <ul className="mt-3 space-y-2 text-sm text-fg/60">
            <li><Link href="/campaigns" className="hover:text-limeink">Campaigns</Link></li>
            <li><Link href="/earnings" className="hover:text-limeink">Earnings</Link></li>
            <li><Link href="/how-it-works" className="hover:text-limeink">How It Works</Link></li>
            {!user && (
              <li><Link href="/signup" className="hover:text-limeink">Sign up free</Link></li>
            )}
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-fg">Brands</p>
          <ul className="mt-3 space-y-2 text-sm text-fg/60">
            <li><Link href="/brands" className="hover:text-limeink">For Brands</Link></li>
            <li><Link href="/pricing" className="hover:text-limeink">Pricing</Link></li>
            <li><Link href="/support" className="hover:text-limeink">Contact Support</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-fg">Legal</p>
          <ul className="mt-3 space-y-2 text-sm text-fg/60">
            <li><Link href="/terms" className="hover:text-limeink">Terms of Service</Link></li>
            <li><Link href="/rules" className="hover:text-limeink">Rules</Link></li>
            <li><Link href="/privacy" className="hover:text-limeink">Privacy Policy</Link></li>
            <li><Link href="/refund" className="hover:text-limeink">Refund Policy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-fg/10 py-4 text-center text-xs leading-relaxed text-fg/40">
        <p className="mx-auto max-w-2xl px-4">
          Campaigns are funded in USDT (TRC20) before they go live.
        </p>
        <p className="mt-2">
          © 2026 {BRAND_NAME}. All rights reserved. TikTok, Instagram and
          YouTube only — no Facebook.
        </p>
      </div>
    </footer>
  );
}
