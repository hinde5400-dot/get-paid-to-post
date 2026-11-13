"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import SignOutButton from "./SignOutButton";
import type { UserMode } from "@/lib/mode";

/**
 * Profile icon at the top-right of the header, opening a
 * dropdown menu. Guests see Create Account / Sign in / Light mode.
 * Creator mode: Dashboard / Profile / Earnings / Light mode /
 * Log out. Brand mode: ONLY brand pages (My Campaigns, Launch
 * Campaign, Payments, Brand Profile) — never a creator link.
 * The owner also sees an Admin entry, in both modes.
 */
export default function ProfileMenu({
  userEmail,
  userName,
  isAdmin = false,
  mode = "creator",
}: {
  userEmail: string | null;
  userName?: string | null;
  isAdmin?: boolean;
  mode?: UserMode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside tap or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const displayName = userName ?? userEmail ?? "Guest";
  const initial = userEmail ? displayName[0].toUpperCase() : null;

  const itemCls =
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-fg transition hover:bg-fg/5";

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Profile menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-fg/15 bg-card text-fg transition hover:border-lime hover:text-lime"
      >
        {initial ? (
          <span className="font-display text-base font-black">{initial}</span>
        ) : (
          <span className="text-xl leading-none" aria-hidden>
            ○
          </span>
        )}
      </button>

      {open && (
        <div className="animate-fade-in absolute right-0 top-12 z-50 w-64 rounded-2xl border border-fg/10 bg-card p-2 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-fg/10 px-3 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime/15 font-display text-base font-black text-lime">
              {initial ?? "G"}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-fg">
                {displayName}
              </span>
              <span className="block text-xs text-fg/50">
                {userEmail ?? "Signed out"}
              </span>
            </span>
          </div>

          <div className="py-2">
            {userEmail ? (
              mode === "brand" ? (
                <>
                  <Link href="/brand/campaigns" className={itemCls}>
                    <span className="w-5 text-center">🏢</span> My Campaigns
                  </Link>
                  <Link href="/brands" className={itemCls}>
                    <span className="w-5 text-center">➕</span> Launch Campaign
                  </Link>
                  <Link href="/brand/payments" className={itemCls}>
                    <span className="w-5 text-center">$</span> Payments
                  </Link>
                  <Link href="/brand/profile" className={itemCls}>
                    <span className="w-5 text-center">○</span> Brand Profile
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" className={itemCls}>
                      <span className="w-5 text-center">⚙</span> Admin
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <Link href="/dashboard" className={itemCls}>
                    <span className="w-5 text-center">▣</span> Dashboard
                  </Link>
                  <Link href="/dashboard" className={itemCls}>
                    <span className="w-5 text-center">○</span> Profile
                  </Link>
                  <Link href="/earnings" className={itemCls}>
                    <span className="w-5 text-center">$</span> Earnings
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" className={itemCls}>
                      <span className="w-5 text-center">⚙</span> Admin
                    </Link>
                  )}
                </>
              )
            ) : (
              <>
                <Link
                  href="/signup"
                  className="mb-1 block rounded-full bg-lime py-2.5 text-center text-sm font-black text-black transition hover:bg-limedark"
                >
                  Create Account
                </Link>
                <Link href="/login" className={itemCls}>
                  <span className="w-5 text-center">→</span> Sign in
                </Link>
              </>
            )}
          </div>

          <div className="border-t border-fg/10 py-2">
            <ThemeToggle />
            {userEmail && (
              <div className="px-3 py-2">
                <SignOutButton className="w-full" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
