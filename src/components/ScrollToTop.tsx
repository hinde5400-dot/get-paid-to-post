"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Scroll restoration (2026-11-16, P1-4): route changes often
 * opened the new page scrolled down, with the top heading
 * clipped under the sticky header. On a forward navigation to a
 * different path, scroll back to the top. Back/forward
 * (popstate) keeps the browser's own restored position, and
 * same-path changes (tabs, filters) keep their scroll.
 */
export default function ScrollToTop() {
  const pathname = usePathname();
  const popRef = useRef(false);

  useEffect(() => {
    const onPop = () => {
      popRef.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (popRef.current) {
      popRef.current = false;
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
