"use client";

import { useState } from "react";

export interface FaqItem {
  q: string;
  a: string;
}

export default function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-white/10 bg-card"
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-bold text-white"
          >
            {item.q}
            <span className="text-sun">{open === i ? "−" : "+"}</span>
          </button>
          {open === i && (
            <p className="px-5 pb-5 text-sm leading-relaxed text-white/70">
              {item.a}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
