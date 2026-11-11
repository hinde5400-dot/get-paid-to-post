"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

/**
 * Premium dropdown — dark card #1A1A1A, rounded 16px, small icons, a
 * lime checkmark on the selected option, smooth open animation and a
 * soft shadow. No native <select> white list. Closes on outside tap
 * or Escape. The dark card stays dark in both themes.
 */
export default function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex w-full items-center gap-2.5 rounded-2xl border border-white/15 bg-[#1A1A1A] px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:border-lime/60 focus:border-lime focus:outline-none"
      >
        {selected.icon}
        <span className="flex-1 text-left">{selected.label}</span>
        <span
          className={`text-white/50 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          ⌄
        </span>
      </button>
      {open && (
        <div className="animate-dropdown-in absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#1A1A1A] p-1.5 shadow-2xl">
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${
                  active
                    ? "bg-lime/15 text-lime"
                    : "text-white/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                {o.icon}
                <span className="flex-1">{o.label}</span>
                {active && (
                  <span className="font-black text-lime" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
