"use client";

import { useEffect, useRef, useState } from "react";
import type { BrandMessage } from "@/lib/types";

/**
 * Owner-only brand-messages inbox (Admin Review page). All messages,
 * newest first — campaign title, brand name, message, proof link,
 * the campaign's Transaction ID when submitted, and time. Unread
 * messages are highlighted; viewing the inbox marks them read.
 */
export default function AdminMessagesList({
  messages: initial,
}: {
  messages: BrandMessage[];
}) {
  const [messages, setMessages] = useState<BrandMessage[]>(initial);
  const markedRef = useRef(false);

  // Viewing the inbox marks its unread messages as read.
  useEffect(() => {
    if (markedRef.current) return;
    markedRef.current = true;
    const unreadCampaigns = [
      ...new Set(
        initial.filter((m) => !m.is_read).map((m) => m.campaign_id)
      ),
    ];
    if (unreadCampaigns.length === 0) return;
    void Promise.all(
      unreadCampaigns.map((campaignId) =>
        fetch(`/api/campaigns/${campaignId}/messages`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markRead: true }),
        }).catch(() => undefined)
      )
    ).then(() => {
      setMessages((prev) => prev.map((m) => ({ ...m, is_read: true })));
    });
  }, [initial]);

  if (messages.length === 0) {
    return (
      <div className="rounded-3xl border border-fg/10 bg-card p-6 text-center text-sm text-fg/60">
        No brand messages yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`rounded-3xl border bg-card p-5 ${
            m.is_read ? "border-fg/10" : "border-lime/50"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 truncate font-display text-base font-black tracking-tight text-fg">
              {m.campaign_title ?? "Campaign"}
            </p>
            {!m.is_read && (
              <span className="shrink-0 rounded-full bg-lime px-3 py-1 text-xs font-black text-black">
                New
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-fg/60">
            {m.brand_name ?? "Brand"}
          </p>

          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fg">
            {m.message}
          </p>

          {m.proof_url && (
            <a
              href={m.proof_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block break-all rounded-xl bg-fg/5 px-4 py-3 text-sm font-bold text-lime underline"
            >
              View proof ↗
            </a>
          )}

          <div className="mt-3 rounded-xl bg-fg/5 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
              Transaction ID
            </p>
            {m.payment_tx_id ? (
              <p className="mt-1 break-all font-mono text-xs font-bold text-lime">
                {m.payment_tx_id}
              </p>
            ) : (
              <p className="mt-1 text-xs font-semibold text-fg/50">
                Not submitted yet
              </p>
            )}
          </div>

          <p className="mt-3 text-xs text-fg/40">
            {new Date(m.created_at).toLocaleString("en-US")}
          </p>
        </div>
      ))}
    </div>
  );
}
