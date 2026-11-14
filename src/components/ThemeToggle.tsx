"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "gptp-theme-v2";

/**
 * Light / Dark mode toggle.
 * Flips data-theme on <html> (see globals.css for the variables) and
 * persists the choice in localStorage. Default is light (grey).
 */
export default function ThemeToggle({
  className = "",
}: {
  className?: string;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "light" || t === "dark") setTheme(t);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — the toggle still works for this visit.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-fg transition hover:bg-fg/5 ${className}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fg/5 text-base">
        {theme === "dark" ? "☀" : "☾"}
      </span>
      {theme === "dark" ? "Light mode" : "Dark mode"}
      <span
        className={`ml-auto flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
          theme === "light" ? "bg-lime" : "bg-fg/20"
        }`}
        aria-hidden
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
            theme === "light" ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
