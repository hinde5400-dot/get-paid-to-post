"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bottom navigation — only three items: Discover, My Posts, More.
 * It coexists with the top-left hamburger menu. Bigger icons,
 * lime active state.
 */
const ITEMS = [
  { href: "/campaigns", label: "Discover", icon: "🔍" },
  { href: "/my-posts", label: "My Posts", icon: "🎬" },
  { href: "/more", label: "More", icon: "☰" },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-fg/10 bg-ink/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-3">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
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
