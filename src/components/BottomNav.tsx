"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bottom navigation (TryShoot-style), restored per the owner's latest
 * spec — it coexists with the top-left hamburger menu. Bigger icons
 * than the first version, lime active state.
 */
const ITEMS = [
  { href: "/campaigns", label: "Discover", icon: "🔍" },
  { href: "/my-posts", label: "My Posts", icon: "🎬" },
  { href: "/inbox", label: "Inbox", icon: "✉️" },
  { href: "/news", label: "News", icon: "📰" },
  { href: "/more", label: "More", icon: "☰" },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-fg/10 bg-ink/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/campaigns" && pathname === "/");
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
