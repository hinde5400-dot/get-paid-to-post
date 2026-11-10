"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BrandMessage } from "@/lib/types";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

function imageUrl(campaignId: string, messageId: string) {
  return `/api/campaigns/${campaignId}/messages/${messageId}/image`;
}

/**
 * Owner-only brand chat inbox (Admin Review page). Messages are
 * grouped into one thread per campaign — campaign title, brand name,
 * the campaign's Transaction ID, and the full two-way conversation
 * (brand messages and admin replies, oldest first), with proof
 * screenshots shown inline. The admin replies in the thread itself.
 * Unread messages are highlighted; viewing the inbox marks them read.
 */
export default function AdminMessagesList({
  messages: initial,
}: {
  messages: BrandMessage[];
}) {
  const { showError, showSuccess } = useToast();
  const [messages, setMessages] = useState<BrandMessage[]>(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
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

  const threads = useMemo(() => {
    const byCampaign = new Map<string, BrandMessage[]>();
    for (const m of messages) {
      const list = byCampaign.get(m.campaign_id) ?? [];
      list.push(m);
      byCampaign.set(m.campaign_id, list);
    }
    // Newest thread first; messages inside a thread oldest first.
    return [...byCampaign.entries()]
      .map(([campaignId, list]) => ({
        campaignId,
        messages: [...list].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
      }))
      .sort((a, b) => {
        const lastA = a.messages[a.messages.length - 1];
        const lastB = b.messages[b.messages.length - 1];
        return (
          new Date(lastB?.created_at ?? 0).getTime() -
          new Date(lastA?.created_at ?? 0).getTime()
        );
      });
  }, [messages]);

  async function reply(campaignId: string) {
    const text = (drafts[campaignId] ?? "").trim();
    if (!text) {
      showError("Write a reply first.");
      return;
    }
    if (text.length > 2000) {
      showError("Reply must be 2000 characters or less.");
      return;
    }
    setSending((prev) => ({ ...prev, [campaignId]: true }));
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send the reply.");
      const saved = data.message as BrandMessage;
      setMessages((prev) => [...prev, saved]);
      setDrafts((prev) => ({ ...prev, [campaignId]: "" }));
      showSuccess("Reply sent to the brand.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not send the reply.");
    } finally {
      setSending((prev) => ({ ...prev, [campaignId]: false }));
    }
  }

  if (threads.length === 0) {
    return (
      <div className="rounded-3xl border border-fg/10 bg-card p-6 text-center text-sm text-fg/60">
        No brand messages yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {threads.map(({ campaignId, messages: thread }) => {
        const first = thread[0];
        const unread = thread.filter((m) => !m.is_read).length;
        const draft = drafts[campaignId] ?? "";
        const busy = sending[campaignId] ?? false;
        return (
          <div
            key={campaignId}
            id={`brand-thread-${campaignId}`}
            className={`scroll-mt-24 rounded-3xl border bg-card p-5 target:ring-2 target:ring-red-500 ${
              unread > 0 ? "border-red-500/50" : "border-fg/10"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-display text-base font-black tracking-tight text-fg">
                {first?.campaign_title ?? "Campaign"}
              </p>
              {unread > 0 && (
                <span className="shrink-0 rounded-full bg-red-500 px-3 py-1 text-xs font-black text-white">
                  {unread} New
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-sm text-fg/60">
              {first?.brand_name ?? "Brand"}
            </p>

            <div className="mt-3 rounded-xl bg-fg/5 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
                Transaction ID
              </p>
              {first?.payment_tx_id ? (
                <p className="mt-1 break-all font-mono text-xs font-bold text-red-300">
                  {first.payment_tx_id}
                </p>
              ) : (
                <p className="mt-1 text-xs font-semibold text-fg/50">
                  Not submitted yet
                </p>
              )}
            </div>

            <div className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-2xl bg-ink/60 p-4">
              {thread.map((m) => {
                const own = m.sender === "admin";
                return (
                  <div
                    key={m.id}
                    className={`flex ${own ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        own
                          ? "rounded-br-md bg-red-500/15"
                          : "rounded-bl-md bg-fg/5"
                      }`}
                    >
                      <p className="text-[11px] font-black uppercase tracking-wider text-fg/50">
                        {own ? "You" : first?.brand_name ?? "Brand"}
                      </p>
                      {m.message && (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-fg">
                          {m.message}
                        </p>
                      )}
                      {m.message_type === "image" && m.image_path && (
                        <a
                          href={imageUrl(campaignId, m.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageUrl(campaignId, m.id)}
                            alt="Payment proof"
                            className="max-h-64 w-auto rounded-xl border border-fg/10"
                          />
                          <span className="mt-1 block text-xs font-bold text-red-300 underline">
                            Open proof ↗
                          </span>
                        </a>
                      )}
                      <p className="mt-2 text-[11px] text-fg/40">
                        {new Date(m.created_at).toLocaleString("en-US")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [campaignId]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") void reply(campaignId);
                }}
                placeholder="Reply to this brand…"
                maxLength={2000}
                className="min-w-0 flex-1 rounded-xl border border-fg/15 bg-ink px-4 py-3 text-sm text-fg outline-none placeholder:text-fg/30 focus:border-red-500"
              />
              <button
                type="button"
                onClick={() => void reply(campaignId)}
                disabled={busy || !draft.trim()}
                className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <Spinner /> Loading...
                  </>
                ) : (
                  "Reply"
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
