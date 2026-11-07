"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/campaigns" && pathname === "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                active ? "text-sun" : "text-white/60"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
