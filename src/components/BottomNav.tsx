"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserMode } from "@/lib/mode";

/**
 * Bottom navigation — one navigation per mode, never both.
 * Guests keep three items. Creator mode: Discover, My Posts,
 * Earnings, More. Brand mode: My Campaigns, Launch Campaign,
 * Payments, Brand Profile. Compact mobile-first bar: small SVG
 * icons (never emoji) and short labels, like a professional
 * mobile app. Desktop hides it — the drawer + profile menu
 * carry navigation there.
 */

function IconSearch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function IconFilm({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4" />
    </svg>
  );
}
function IconWallet({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 7H5a2 2 0 0 1 0-4h13v4" />
      <path d="M20 7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <circle cx="16.5" cy="14" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconMenu({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className={className} aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
function IconBriefcase({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </svg>
  );
}
function IconPlus({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className={className} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconCard({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}
function IconUser({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className={className} aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  );
}

type NavIcon = (props: { className?: string }) => JSX.Element;

const GUEST_ITEMS: { href: string; label: string; Icon: NavIcon }[] = [
  { href: "/campaigns", label: "Discover", Icon: IconSearch },
  { href: "/my-posts", label: "My Posts", Icon: IconFilm },
  { href: "/more", label: "More", Icon: IconMenu },
];

const CREATOR_ITEMS: { href: string; label: string; Icon: NavIcon }[] = [
  { href: "/campaigns", label: "Discover", Icon: IconSearch },
  { href: "/my-posts", label: "My Posts", Icon: IconFilm },
  { href: "/earnings", label: "Earnings", Icon: IconWallet },
  { href: "/more", label: "More", Icon: IconMenu },
];

const BRAND_ITEMS: { href: string; label: string; Icon: NavIcon }[] = [
  { href: "/brand/campaigns", label: "My Campaigns", Icon: IconBriefcase },
  { href: "/brands", label: "Launch", Icon: IconPlus },
  { href: "/brand/payments", label: "Payments", Icon: IconCard },
  { href: "/brand/profile", label: "Profile", Icon: IconUser },
];

export default function BottomNav({
  mode,
  isGuest,
}: {
  mode: UserMode;
  isGuest: boolean;
}) {
  const pathname = usePathname();
  const items = isGuest
    ? GUEST_ITEMS
    : mode === "brand"
      ? BRAND_ITEMS
      : CREATOR_ITEMS;
  const cols = items.length === 4 ? "grid-cols-4" : "grid-cols-3";
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-fg/10 bg-ink/95 backdrop-blur md:hidden">
      <div className={`grid ${cols}`}>
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.Icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold leading-tight ${
                active ? "text-limeink" : "text-fg/50"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
