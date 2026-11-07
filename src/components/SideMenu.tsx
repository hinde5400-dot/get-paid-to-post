"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "./SignOutButton";
import ThemeToggle from "./ThemeToggle";

/**
 * Top-left hamburger menu (TryShoot-style) opening a slide-in sidebar
 * drawer. Every part of the site is reachable from this one menu, on
 * mobile and desktop. No bottom navigation.
 */

const MENU = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/campaigns", label: "Explore", icon: "◎" },
  { href: "/campaigns", label: "Submit", icon: "+" },
  { href: "/my-posts", label: "My Clips", icon: "▣" },
  { href: "/inbox", label: "Chat", icon: "✉" },
  { href: "/dashboard", label: "Profile", icon: "○" },
  { href: "/earnings", label: "Earnings", icon: "$" },
  { href: "/dashboard#refer", label: "Refer a friend", icon: "🎁" },
  { href: "/news", label: "Blog", icon: "📰" },
  { href: "/support", label: "Help & Support", icon: "?" },
  { href: "/connect", label: "Settings", icon: "⚙" },
];

export default function SideMenu({
  userEmail,
  joined = [],
}: {
  userEmail: string | null;
  joined?: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on Escape, and lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open ]);

  // Close the drawer when the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const initial = userEmail ? userEmail[0].toUpperCase() : "G";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-[5px] rounded-xl border border-fg/15 bg-card transition hover:border-lime hover:text-lime"
      >
        <span className="block h-[2px] w-5 bg-current" />
        <span className="block h-[2px] w-5 bg-current" />
        <span className="block h-[2px] w-5 bg-current" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="animate-fade-in absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <aside className="animate-drawer-in absolute left-0 top-0 flex h-full w-80 max-w-[85vw] flex-col bg-ink shadow-2xl">
            <div className="flex items-center justify-between border-b border-fg/10 px-5 py-4">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime font-display text-lg font-black text-black">
                  G
                </span>
                <span className="font-display text-base font-black uppercase leading-tight tracking-tight text-fg">
                  Get Paid
                  <span className="block text-[11px] font-bold normal-case tracking-wide text-fg/50">
                    To Post
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-fg/15 text-xl text-fg/70 transition hover:border-lime hover:text-lime"
              >
                ×
              </button>
            </div>

            <div className="flex items-center gap-3 border-b border-fg/10 px-5 py-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lime/15 font-display text-lg font-black text-lime">
                {initial}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-fg">
                  {userEmail ?? "Guest"}
                </span>
                <span className="block text-xs text-fg/50">
                  {userEmail ? "Signed in" : "Signed out"}
                </span>
              </span>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-3">
              {MENU.map((item) => {
                const active =
                  pathname === item.href && item.label !== "Submit";
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                      active
                        ? "bg-lime text-black"
                        : "text-fg/80 hover:bg-fg/5 hover:text-fg"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fg/5 text-base">
                      {item.icon}
                    </span>
                    {item.label}
                    <span className="ml-auto text-fg/30">›</span>
                  </Link>
                );
              })}
            </nav>

            {/* JOINED — campaigns this user has submitted to (real data
                only). Guests and users with no submissions see the
                honest empty line. */}
            <div className="border-t border-fg/10 px-5 py-4">
              <p className="text-xs font-black uppercase tracking-widest text-fg/50">
                Joined
              </p>
              {joined.length === 0 ? (
                <p className="mt-2 text-sm text-fg/60">
                  No shoots joined yet.
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {joined.map((j) => (
                    <li key={j.id}>
                      <Link
                        href={`/campaign/${j.id}`}
                        onClick={() => setOpen(false)}
                        className="block truncate rounded-lg px-2 py-1.5 text-sm font-bold text-fg/80 transition hover:bg-fg/5 hover:text-lime"
                      >
                        {j.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-fg/10 p-4">
              <ThemeToggle className="mb-2" />
              {userEmail ? (
                <div className="flex gap-2">
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-full bg-lime py-2.5 text-center text-sm font-black text-black transition hover:bg-limedark"
                  >
                    Dashboard
                  </Link>
                  <SignOutButton />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="rounded-full bg-lime py-2.5 text-center text-sm font-black text-black transition hover:bg-limedark"
                  >
                    Create Account
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="rounded-full border border-fg/20 py-2.5 text-center text-sm font-bold text-fg transition hover:border-lime hover:text-lime"
                  >
                    Sign in
                  </Link>
                </div>
              )}
            </div>
          </aside>
          </div>,
          document.body
        )}
    </>
  );
}
