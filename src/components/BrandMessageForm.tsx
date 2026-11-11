"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { BrandMessage } from "@/lib/types";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function imageUrl(campaignId: string, messageId: string) {
  return `/api/campaigns/${campaignId}/messages/${messageId}/image`;
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Short, professional timestamps: a day-divider chip is
// inserted whenever the date changes mid-thread, and each bubble
// shows only the time.
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
 * Private two-way chat with the admin on the payment page. The brand
 * sends a text message (e.g. its Transaction ID) and/or uploads a
 * payment proof screenshot directly — image files only, max 5 MB.
 * No Drive/Imgur links. Only this campaign's brand and the admin
 * ever see this thread, and the admin can reply here too.
 */
export default function BrandMessageForm({
  campaignId,
  initialMessages,
  viewerIsAdmin,
  brandName,
}: {
  campaignId: string;
  initialMessages: BrandMessage[];
  viewerIsAdmin: boolean;
  brandName: string;
}) {
  const { showError, showSuccess } = useToast();
  const [messages, setMessages] = useState<BrandMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const markReadInFlight = useRef(false);

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Round-4 P2-B6: when the BRAND opens this chat, the admin's
  // replies are marked read, so the dashboard's "New reply from
  // admin" badge clears. The PATCH is brand-scoped server-side
  // (admin messages only, never content). A failed mark-read is
  // silent — the badge just stays until the next poll.
  // NOTE: this only takes effect once the DB lets a brand update
  // is_read (there is no brand UPDATE policy on brand_messages
  // yet — only the owner can update it — so until that policy
  // lands the PATCH updates zero rows and the badge stays; the
  // call itself is harmless).
  async function markReadIfNeeded(list: BrandMessage[]) {
    if (viewerIsAdmin) return;
    if (!list.some((m) => m.sender === "admin" && !m.is_read)) return;
    if (markReadInFlight.current) return;
    markReadInFlight.current = true;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/messages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markRead: true }),
      });
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.sender === "admin" ? { ...m, is_read: true } : m
          )
        );
      }
    } catch {
      // Badge stays until the next poll.
    } finally {
      markReadInFlight.current = false;
    }
  }

  // Mark read on open.
  useEffect(() => {
    void markReadIfNeeded(initialMessages);
    // Only on mount — later arrivals are handled by refresh().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Round-4 P2-B7: poll the thread every 30s and on window focus,
  // so an admin reply shows without a manual reload. Polling
  // replaces the whole list (server order, oldest first) and then
  // marks any newly arrived admin replies read.
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/messages`);
      const data = await res.json();
      if (res.ok && Array.isArray((data as { messages?: unknown }).messages)) {
        const list = (data as { messages: BrandMessage[] }).messages;
        setMessages(list);
        void markReadIfNeeded(list);
      }
    } catch {
      // Keep the old messages; the next poll retries.
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
    // Only on mount — refresh() reads current state via setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  function isOwn(m: BrandMessage) {
    return viewerIsAdmin ? m.sender === "admin" : m.sender === "brand";
  }

  function senderLabel(m: BrandMessage) {
    if (m.sender === "admin") return viewerIsAdmin ? "You" : "Admin";
    return viewerIsAdmin ? brandName : "You";
  }

  function pickFile(f: File | null) {
    if (!f) {
      setFile(null);
      return;
    }
    if (!IMAGE_TYPES.includes(f.type)) {
      showError("Proof must be an image (JPEG, PNG, WebP or GIF).");
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      showError("Proof image must be 5 MB or smaller.");
      return;
    }
    setFile(f);
  }

  async function send() {
    const message = text.trim();
    if (!message && !file) {
      showError("Write a message or attach a proof image.");
      return;
    }
    if (message.length > 2000) {
      showError("Message must be 2000 characters or less.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("message", message);
      if (file) form.append("image", file);
      const res = await fetch(`/api/campaigns/${campaignId}/messages`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send the message.");
      const saved = data.message as BrandMessage;
      setMessages((prev) => [...prev, saved]);
      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      showSuccess("Message sent.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not send the message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="rounded-full border border-fg/20 px-3 py-1 text-xs font-bold text-fg hover:border-lime hover:text-lime disabled:opacity-40"
        >
          {refreshing ? "Refreshing..." : "↻ Refresh chat"}
        </button>
      </div>
      {/* WhatsApp-style thread: always visible (even before the
          first message, so the chat never looks closed), tall and
          scrollable, with breathing room around the bubbles. */}
      <div
        ref={threadRef}
        className="h-[26rem] space-y-4 overflow-y-auto rounded-2xl bg-ink/60 p-4 sm:h-[30rem] sm:p-5 md:h-[34rem]"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="max-w-sm rounded-2xl border border-fg/10 bg-card px-5 py-4">
              <p className="text-sm font-black text-fg">
                Private conversation with the admin
              </p>
              <p className="mt-1 text-sm leading-relaxed text-fg/60">
                Send your Transaction ID and payment proof screenshot
                below. The admin replies in this chat.
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => {
            const own = isOwn(m);
            const showDay =
              i === 0 ||
              dayKey(m.created_at) !== dayKey(messages[i - 1].created_at);
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
                  className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%] ${
                    own
                      ? "rounded-br-md bg-lime text-black"
                      : "rounded-bl-md bg-fg/10 text-fg"
                  }`}
                >
                  <p
                    className={`text-[11px] font-black uppercase tracking-wider ${
                      own ? "text-black/60" : "text-fg/50"
                    }`}
                  >
                    {senderLabel(m)}
                  </p>
                  {m.message && (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
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
                      <span
                        className={`mt-1 block text-xs font-bold underline ${
                          own ? "text-black/70" : "text-lime"
                        }`}
                      >
                        Open proof ↗
                      </span>
                    </a>
                  )}
                  <p
                    className={`mt-1.5 text-right text-[11px] ${
                      own ? "text-black/50" : "text-fg/40"
                    }`}
                  >
                    {timeLabel(m.created_at)}
                  </p>
                </div>
              </div>
              </Fragment>
            );
            })}
          </>
        )}
      </div>

      <label className="mt-5 block text-sm font-bold text-fg">
        Message the admin
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your Transaction ID or tell the admin you sent the budget."
          rows={3}
          maxLength={2000}
          className="mt-1 max-h-48 w-full resize-y rounded-xl border border-fg/15 bg-ink px-4 py-3 text-sm leading-relaxed text-fg outline-none placeholder:text-fg/30 focus:border-lime"
        />
      </label>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-fg/5 px-4 py-3">
          <p className="min-w-0 truncate text-sm font-semibold text-fg">
            📎 {file.name}{" "}
            <span className="text-xs font-medium text-fg/50">
              ({formatSize(file.size)})
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="shrink-0 rounded-full bg-fg/10 px-3 py-1 text-xs font-bold text-fg/70"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-3 w-full rounded-xl border border-dashed border-fg/20 bg-fg/5 px-4 py-3 text-sm font-bold text-fg/70 transition hover:border-lime/50 hover:text-fg"
        >
          📎 Attach proof screenshot (JPEG, PNG, WebP or GIF — max 5 MB)
        </button>
      )}

      <button
        type="button"
        onClick={() => void send()}
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <Spinner /> Loading...
          </>
        ) : (
          "Send message"
        )}
      </button>
    </div>
  );
}
