import Link from "next/link";
import { BRAND_NAME, SITE_DOMAIN } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-card/60 pb-8">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-4">
        <div>
          <p className="font-display text-lg font-black uppercase tracking-tight text-white">{BRAND_NAME}</p>
          <p className="mt-2 text-sm text-white/60">
            Post Clips. Get Paid Per View. Creators post short clips on
            TikTok, Instagram and YouTube and get paid per view. No follower
            minimum.
          </p>
          <p className="mt-3 text-xs text-white/40">{SITE_DOMAIN}</p>
        </div>
        <div>
          <p className="text-sm font-bold text-white">Creators</p>
          <ul className="mt-3 space-y-2 text-sm text-white/60">
            <li><Link href="/campaigns" className="hover:text-sun">Campaigns</Link></li>
            <li><Link href="/how-it-works" className="hover:text-sun">How It Works</Link></li>
            <li><Link href="/signup" className="hover:text-sun">Sign up free</Link></li>
            <li><Link href="/earnings" className="hover:text-sun">Earnings</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-white">Brands</p>
          <ul className="mt-3 space-y-2 text-sm text-white/60">
            <li><Link href="/brands" className="hover:text-sun">For Brands</Link></li>
            <li><Link href="/brands" className="hover:text-sun">Launch a campaign ($500 min)</Link></li>
            <li><Link href="/support" className="hover:text-sun">Contact Support</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-white">Legal</p>
          <ul className="mt-3 space-y-2 text-sm text-white/60">
            <li><Link href="/terms" className="hover:text-sun">Terms of Service</Link></li>
            <li><Link href="/privacy" className="hover:text-sun">Privacy Policy</Link></li>
            <li><Link href="/support" className="hover:text-sun">Support (Discord)</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/40">
        © 2026 {BRAND_NAME}. All rights reserved. TikTok, Instagram and
        YouTube only — no Facebook.
      </div>
    </footer>
  );
}
