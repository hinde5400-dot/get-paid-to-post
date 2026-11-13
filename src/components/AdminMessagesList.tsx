"use client";

import { Fragment, useMemo, useState } from "react";
import type { BrandMessage } from "@/lib/types";
import { truncateTxId } from "@/lib/validate";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

function imageUrl(campaignId: string, messageId: string) {
  return `/api/campaigns/${campaignId}/messages/${messageId}/image`;
}

// Bubbles show only the time; a day-divider chip is inserted
// whenever the date changes mid-thread, and the thread header
// already carries the full date of the latest message.
function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return "Today";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Owner-only brand chat inbox (Admin Review page). Messages are
 * grouped into one thread per campaign — campaign title, brand name,
 * the campaign's Transaction ID, and the full two-way conversation
 * (brand messages and admin replies, oldest first), with proof
 * screenshots shown inline. The admin replies in the thread itself.
 *
 * Threads start collapsed. Opening a thread marks ITS messages
 * read — and only on PATCH success, never optimistically and never
 * for threads the admin never opened. (The old code marked every
 * unread message read on inbox mount, even unopened threads, and
 * set local is_read even when the PATCH failed.)
 *
 * Paginated: the inbox pages newest-first (props total/page/
 * pageSize) with "showing X–Y of Z", so old threads never vanish
 * silently.
 */
export default function AdminMessagesList({
  messages: initial,
  total = null,
  page = 1,
  pageSize = 100,
  /** The review list's current page, so Prev/Next links keep it
   *  instead of resetting the review list to page 1. */
  otherPage = 1,
}: {
  messages: BrandMessage[];
  total?: number | null;
  page?: number;
  pageSize?: number;
  otherPage?: number;
}) {
  const { showError, showSuccess } = useToast();
  const [messages, setMessages] = useState<BrandMessage[]>(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [marking, setMarking] = useState<Record<string, boolean>>({});

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

  // Opening a thread marks ITS messages read — only this thread,
  // and only when the PATCH succeeds. A failed PATCH keeps the
  // unread badge and shows an error; local is_read is never set
  // optimistically.
  async function toggleThread(campaignId: string) {
    const willOpen = !open[campaignId];
    setOpen((prev) => ({ ...prev, [campaignId]: willOpen }));
    if (!willOpen || marking[campaignId]) return;
    const thread = threads.find((t) => t.campaignId === campaignId);
    if (!thread || thread.messages.every((m) => m.is_read)) return;
    setMarking((prev) => ({ ...prev, [campaignId]: true }));
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/messages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markRead: true }),
      });
      if (!res.ok) throw new Error("Could not mark messages as read.");
      setMessages((prev) =>
        prev.map((m) =>
          m.campaign_id === campaignId ? { ...m, is_read: true } : m
        )
      );
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : "Could not mark messages as read."
      );
    } finally {
      setMarking((prev) => ({ ...prev, [campaignId]: false }));
    }
  }

  const totalCount = total ?? messages.length;
  const showingFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, totalCount);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (threads.length === 0 && totalCount === 0) {
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
        const isOpen = Boolean(open[campaignId]);
        const last = thread[thread.length - 1];
        return (
          <div
            key={campaignId}
            id={`brand-thread-${campaignId}`}
            className={`scroll-mt-24 rounded-3xl border bg-card p-5 target:ring-2 target:ring-red-500 ${
              unread > 0 ? "border-red-500/50" : "border-fg/10"
            }`}
          >
            <button
              type="button"
              onClick={() => void toggleThread(campaignId)}
              className="flex w-full flex-wrap items-center gap-2 text-left"
            >
              <p className="min-w-0 flex-1 truncate font-display text-base font-black tracking-tight text-fg">
                {first?.campaign_title ?? "Campaign"}
              </p>
              {/* Replied / not-replied indicator (admin tabs):
                  the last message decides — if the admin wrote
                  last, the brand has been answered; if the brand
                  wrote last, the admin still owes a reply. */}
              {last ? (
                last.sender === "admin" ? (
                  <span
                    className="shrink-0 rounded-full bg-lime/15 px-3 py-1 text-xs font-black text-lime"
                    title={`You replied ${new Date(last.created_at).toLocaleString("en-US")}`}
                  >
                    ✓ Replied
                  </span>
                ) : (
                  <span
                    className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-black text-amber-300"
                    title={`Brand wrote last, ${new Date(last.created_at).toLocaleString("en-US")} — no reply from you yet`}
                  >
                    ⏳ Awaiting your reply
                  </span>
                )
              ) : null}
              {thread.some((m) => m.message_type === "image") && (
                <span
                  className="shrink-0 rounded-full bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-300"
                  title="This thread has a payment-proof image attached"
                >
                  📎 Proof attached
                </span>
              )}
              {unread > 0 && (
                <span className="shrink-0 rounded-full bg-red-500 px-3 py-1 text-xs font-black text-white">
                  {unread} New
                </span>
              )}
              <span className="shrink-0 rounded-full border border-fg/20 px-3 py-1 text-xs font-bold text-fg">
                {isOpen ? "Close ↑" : "Open thread ↓"}
              </span>
            </button>
            <p className="mt-1 truncate text-sm text-fg/60">
              {first?.brand_name ?? "Brand"}
              {last ? (
                <span className="text-fg/40">
                  {" · "}
                  {new Date(last.created_at).toLocaleString("en-US")}
                </span>
              ) : null}
            </p>

            {isOpen && (
              <>
            <div className="mt-3 rounded-xl bg-fg/5 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
                Transaction ID
              </p>
              {first?.payment_tx_id ? (
                <p className="mt-1 break-all font-mono text-xs font-bold text-red-300">
                  {truncateTxId(first.payment_tx_id)}
                </p>
              ) : (
                <p className="mt-1 text-xs font-semibold text-fg/50">
                  Not submitted yet
                </p>
              )}
            </div>

            <div className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-2xl bg-ink/60 p-4">
              {thread.map((m, i) => {
                const own = m.sender === "admin";
                const showDay =
                  i === 0 ||
                  dayKey(m.created_at) !== dayKey(thread[i - 1].created_at);
                return (
                  <Fragment key={m.id}>
                    {showDay && (
                      <div className="flex justify-center">
                        <span className="rounded-full bg-fg/10 px-3 py-1 text-[11px] font-bold text-fg/50">
                          {dayLabel(m.created_at)}
                        </span>
                      </div>
                    )}
                  <div
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
                            className="max-h-80 w-auto rounded-xl border border-fg/10"
                          />
                          <span className="mt-1 block text-xs font-bold text-red-300 underline">
                            Open proof ↗
                          </span>
                        </a>
                      )}
                      <p className="mt-2 text-[11px] text-fg/40">
                        {timeLabel(m.created_at)}
                      </p>
                    </div>
                  </div>
                  </Fragment>
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
              </>
            )}
          </div>
        );
      })}
      {/* Pagination: Prev / Next + "showing X of Y". Plain links —
          the admin page reads inboxPage from the URL. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-fg/10 bg-card px-5 py-3">
        <p className="text-sm text-fg/60">
          Showing {showingFrom}–{showingTo} of {totalCount} message
          {totalCount === 1 ? "" : "s"}
          {totalPages > 1 ? ` (page ${page} of ${totalPages})` : ""}
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <a
              href={`?tab=messages&inboxPage=${page - 1}${otherPage > 1 ? `&reviewPage=${otherPage}` : ""}`}
              className="rounded-full border border-fg/20 px-4 py-2 text-sm font-bold text-fg transition hover:border-red-500 hover:text-red-300"
            >
              ← Prev
            </a>
          ) : (
            <span className="cursor-not-allowed rounded-full border border-fg/10 px-4 py-2 text-sm font-bold text-fg/30">
              ← Prev
            </span>
          )}
          {page < totalPages ? (
            <a
              href={`?tab=messages&inboxPage=${page + 1}${otherPage > 1 ? `&reviewPage=${otherPage}` : ""}`}
              className="rounded-full border border-fg/20 px-4 py-2 text-sm font-bold text-fg transition hover:border-red-500 hover:text-red-300"
            >
              Next →
            </a>
          ) : (
            <span className="cursor-not-allowed rounded-full border border-fg/10 px-4 py-2 text-sm font-bold text-fg/30">
              Next →
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
