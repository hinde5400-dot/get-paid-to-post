"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Spinner from "./Spinner";

/**
 * Global navigation loading indicator.
 *
 * App Router has no built-in router events, so this watches for
 * clicks on internal links instead: the moment any in-app link is
 * tapped, a lime progress bar appears at the very top of the screen
 * plus a "Loading..." pill — so a tap never looks frozen while the
 * next page (Vercel + Supabase round-trip) loads. The indicator
 * clears as soon as the route actually changes, and a timeout
 * fallback clears it if a navigation stalls or fails, so it can
 * never get stuck on screen.
 *
 * It only reacts to plain left-clicks on same-origin links (no
 * modifier keys, no new-tab/external/download/hash-only links), and
 * it never prevents the navigation itself — it only shows feedback.
 */
function NavigationLoaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Clear the indicator whenever the route actually changes.
  useEffect(() => {
    setLoading(false);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      // External links leave the app — nothing to wait for here.
      if (url.origin !== window.location.origin) return;
      // Same URL (or hash-only change) triggers no navigation.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      setLoading(true);
      // Safety net: never stay visible if the navigation fails.
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setLoading(false), 8000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!loading) return null;

  return (
    <>
      {/* Slim lime progress bar pinned to the very top. */}
      <div
        className="fixed inset-x-0 top-0 z-[80] h-1 overflow-hidden"
        aria-hidden
      >
        <div className="h-full w-1/3 animate-nav-progress bg-lime" />
      </div>
      {/* Centered pill so the tap always gets visible feedback. */}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[80] flex justify-center px-4">
        <div className="flex items-center gap-2 rounded-full border border-fg/15 bg-ink px-4 py-2 text-sm font-bold text-fg shadow-2xl">
          <Spinner /> Loading...
        </div>
      </div>
    </>
  );
}

export default function NavigationLoader() {
  return (
    <Suspense fallback={null}>
      <NavigationLoaderInner />
    </Suspense>
  );
}
