"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "./SignOutButton";
import ThemeToggle from "./ThemeToggle";
import ModeSwitch from "./ModeSwitch";
import Logo from "./Logo";
import DiscordButton from "./DiscordButton";
import type { UserMode } from "@/lib/mode";

/** Small inline SVG icons — the drawer uses these, never emoji. */
function I({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ICONS = {
  home: (c?: string) => <I d="M3 11.5 12 4l9 7.5M5 10.5V20h14v-9.5" className={c} />,
  explore: (c?: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={c ?? "h-4 w-4"} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </svg>
  ),
  film: (c?: string) => <I d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM8 7v10M16 7v10M3 11h5M3 15h5M16 11h5M16 15h5" className={c} />,
  user: (c?: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className={c ?? "h-4 w-4"} aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  ),
  wallet: (c?: string) => <I d="M20 7H5a2 2 0 0 1 0-4h13v4M20 7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" className={c} />,
  chat: (c?: string) => <I d="M21 12a8 8 0 0 1-8 8c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.8A8 8 0 1 1 21 12z" className={c} />,
  briefcase: (c?: string) => <I d="M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" className={c} />,
  plus: (c?: string) => <I d="M12 5v14M5 12h14" className={c} />,
  gear: (c?: string) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={c ?? "h-4 w-4"} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
    </svg>
  ),
  bell: (c?: string) => <I d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9zM10 20a2.2 2.2 0 0 0 4 0" className={c} />,
  legal: (c?: string) => <I d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" className={c} />,
};

type MenuIcon = (className?: string) => JSX.Element;

const CREATOR_MENU: { href: string; label: string; Icon: MenuIcon }[] = [
  { href: "/", label: "Home", Icon: ICONS.home },
  { href: "/campaigns", label: "Explore", Icon: ICONS.explore },
  { href: "/my-posts", label: "My Clips", Icon: ICONS.film },
  { href: "/dashboard", label: "Profile", Icon: ICONS.user },
  { href: "/earnings", label: "Earnings", Icon: ICONS.wallet },
  { href: "/notifications", label: "Notifications", Icon: ICONS.bell },
  { href: "/support", label: "Support", Icon: ICONS.chat },
  { href: "/terms", label: "Legal", Icon: ICONS.legal },
];

const BRAND_MENU: { href: string; label: string; Icon: MenuIcon }[] = [
  { href: "/brand/campaigns", label: "My Campaigns", Icon: ICONS.briefcase },
  { href: "/brands", label: "Launch Campaign", Icon: ICONS.plus },
  { href: "/brand/payments", label: "Payments", Icon: ICONS.wallet },
  { href: "/brand/profile", label: "Brand Profile", Icon: ICONS.user },
  { href: "/notifications", label: "Notifications", Icon: ICONS.bell },
  { href: "/support", label: "Support", Icon: ICONS.chat },
  { href: "/terms", label: "Legal", Icon: ICONS.legal },
];

export default function SideMenu({
  userEmail,
  userName,
  isAdmin = false,
  joined = [],
  mode = "creator",
  canSwitch = false,
}: {
  userEmail: string | null;
  userName?: string | null;
  isAdmin?: boolean;
  joined?: { id: string; title: string }[];
  mode?: UserMode;
  /** True only when the user can use both modes (see ModeSwitch). */
  canSwitch?: boolean;
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

  const displayName = userName ?? userEmail ?? "Guest";
  const initial = displayName[0].toUpperCase();
  const menu = mode === "brand" ? BRAND_MENU : CREATOR_MENU;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-[5px] rounded-xl border border-fg/15 bg-card transition hover:border-lime hover:text-limeink"
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
              <div onClick={() => setOpen(false)}>
                <Logo />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-fg/15 text-xl text-fg/70 transition hover:border-lime hover:text-limeink"
              >
                ×
              </button>
            </div>

            <div className="flex items-center gap-3 border-b border-fg/10 px-5 py-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lime/15 font-display text-lg font-black text-limeink">
                {initial}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-fg">
                  {displayName}
                </span>
                <span className="block text-xs text-fg/50">
                  {userEmail ? userEmail : "Signed out"}
                </span>
              </span>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-3">
              {menu.map((item) => {
                const active = pathname === item.href;
                const ItemIcon = item.Icon;
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
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fg/5">
                      {ItemIcon("h-4 w-4")}
                    </span>
                    {item.label}
                    <span className="ml-auto text-fg/30">›</span>
                  </Link>
                );
              })}

              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                    pathname === "/admin"
                      ? "bg-lime text-black"
                      : "text-fg/80 hover:bg-fg/5 hover:text-fg"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fg/5">
                    {ICONS.gear("h-4 w-4")}
                  </span>
                  Admin
                  <span className="ml-auto text-fg/30">›</span>
                </Link>
              )}

              {/* Switch between creator and brand mode — only when
                  the user can actually use both (ModeSwitch). */}
              {canSwitch && (
                <div className="mt-3 px-1">
                  <ModeSwitch mode={mode} className="w-full" />
                </div>
              )}

              <DiscordButton className="mt-3 px-3" />
            </nav>

            {/* JOINED — campaigns this creator has submitted to
                (real data only). Creator mode only: a brand never
                sees creator submissions here. Guests and users with
                no submissions see the honest empty line. */}
            {mode === "creator" && (
            <div className="border-t border-fg/10 px-5 py-4">
              <p className="text-xs font-black uppercase tracking-widest text-fg/50">
                Joined
              </p>
              {joined.length === 0 ? (
                <p className="mt-2 text-sm text-fg/60">
                  No campaigns joined yet.
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {joined.map((j) => (
                    <li key={j.id}>
                      <Link
                        href={`/campaign/${j.id}`}
                        onClick={() => setOpen(false)}
                        className="block truncate rounded-lg px-2 py-1.5 text-sm font-bold text-fg/80 transition hover:bg-fg/5 hover:text-limeink"
                      >
                        {j.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            )}

            <div className="border-t border-fg/10 p-4">
              <p className="mb-3 text-center text-xs text-fg/40">
                <Link href="/rules" onClick={() => setOpen(false)} className="hover:text-limeink">Rules</Link>
                {" · "}
                <Link href="/terms" onClick={() => setOpen(false)} className="hover:text-limeink">Terms</Link>
                {" · "}
                <Link href="/privacy" onClick={() => setOpen(false)} className="hover:text-limeink">Privacy</Link>
                {" · "}
                <Link href="/how-it-works" onClick={() => setOpen(false)} className="hover:text-limeink">How It Works</Link>
              </p>
              <ThemeToggle className="mb-2" />
              {userEmail ? (
                <div className="flex gap-2">
                  <Link
                    href={mode === "brand" ? "/brand/campaigns" : "/dashboard"}
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-full bg-lime py-2.5 text-center text-sm font-black text-black transition hover:bg-limedark"
                  >
                    {mode === "brand" ? "My Campaigns" : "Dashboard"}
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
                    className="rounded-full border border-fg/20 py-2.5 text-center text-sm font-bold text-fg transition hover:border-lime hover:text-limeink"
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
