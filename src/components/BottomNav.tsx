"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserMode } from "@/lib/mode";

/**
 * Bottom navigation — one navigation per mode, never both.
 * Guests keep the old three items. Creator mode: Discover, My
 * Posts, Earnings, More. Brand mode: My Campaigns, Launch
 * Campaign, Payments, Brand Profile. Same position, style and
 * colours as before; only the items change with the mode.
 */
const GUEST_ITEMS = [
  { href: "/campaigns", label: "Discover", icon: "🔍" },
  { href: "/my-posts", label: "My Posts", icon: "🎬" },
  { href: "/more", label: "More", icon: "☰" },
];

const CREATOR_ITEMS = [
  { href: "/campaigns", label: "Discover", icon: "🔍" },
  { href: "/my-posts", label: "My Posts", icon: "🎬" },
  { href: "/earnings", label: "Earnings", icon: "$" },
  { href: "/more", label: "More", icon: "☰" },
];

const BRAND_ITEMS = [
  { href: "/brand/campaigns", label: "My Campaigns", icon: "🏢" },
  { href: "/brands", label: "Launch Campaign", icon: "➕" },
  { href: "/brand/payments", label: "Payments", icon: "$" },
  { href: "/brand/profile", label: "Brand Profile", icon: "○" },
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
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold ${
                active ? "text-lime" : "text-fg/50"
              }`}
            >
              <span className="text-2xl leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
