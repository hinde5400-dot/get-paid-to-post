"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationItem } from "@/lib/types";
import { timeAgo } from "@/lib/time";
import { useToast } from "@/components/Toast";

/**
 * In-app notifications on the creator's dashboard (admin tabs,
 * migration 0049). A withdrawal marked Paid and a creator
 * Warning both land here as a row. Unread rows are highlighted;
 * "Mark all read" clears them. Renders nothing when there are
 * no notifications — an empty inbox is not a section.
 */
export default function NotificationsPanel({
  notifications,
}: {
  notifications: NotificationItem[];
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { showError } = useToast();

  if (notifications.length === 0) return null;

  const unread = notifications.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
      });
      if (!res.ok) {
        showError("Could not mark notifications as read.");
        return;
      }
      router.refresh();
    } catch {
      showError("Could not mark notifications as read.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Notifications">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold text-fg">
          Notifications{" "}
          {unread > 0 && (
            <span className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-xs font-black text-white">
              {unread} new
            </span>
          )}
        </h2>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            disabled={busy}
            className="rounded-full border border-fg/20 px-4 py-2 text-xs font-bold text-fg transition hover:border-lime hover:text-limeink disabled:opacity-50"
          >
            {busy ? "Marking…" : "Mark all read"}
          </button>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`rounded-2xl border p-4 ${
              n.is_read
                ? "border-fg/10 bg-card"
                : "border-lime/40 bg-lime/10"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-bold text-fg">{n.title}</p>
              <span className="text-xs text-fg/50">{timeAgo(n.created_at)}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-fg/70">
              {n.message}
            </p>
            {n.link && (
              <Link
                href={n.link}
                className="mt-2 inline-block text-sm font-bold text-limeink underline underline-offset-2 hover:text-limeink/80"
              >
                View →
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
