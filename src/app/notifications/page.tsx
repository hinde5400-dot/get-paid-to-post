import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserNotifications } from "@/lib/data";
import MarkNotificationsRead from "@/components/MarkNotificationsRead";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Your Get Paid To Post notifications — campaign approvals, payouts and admin messages.",
};

/** Notifications inbox — real rows from the notifications table
 *  (migration 0049), newest first. Unread rows are highlighted;
 *  each row links where it points (campaign, earnings, admin).
 *  Guests are sent to sign in; a user with no notifications yet
 *  sees the honest empty state, never fake items. */
export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notifications");
  const items = await getUserNotifications(user.id, 50);
  const unread = items.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black uppercase leading-none tracking-tight text-fg md:text-4xl">
            Notifications
          </h1>
          <p className="mt-2 text-sm text-fg/60">
            {items.length === 0
              ? "Campaign approvals, payouts and admin messages will show up here."
              : `${unread} unread · ${items.length} total`}
          </p>
        </div>
        {items.length > 0 && unread > 0 && <MarkNotificationsRead />}
      </div>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-fg/10 bg-card p-6 text-center md:p-10">
          <p className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-lime/15 text-2xl">
            🔔
          </p>
          <p className="mt-4 font-display text-xl font-black uppercase tracking-tight text-fg">
            No notifications yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            When a campaign is approved, a payout is sent, or the admin
            messages you, it will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((n) => {
            const inner = (
              <>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-fg">
                      {n.title}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-fg/60">
                      {n.message}
                    </span>
                  </span>
                  {!n.is_read && (
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-lime" aria-label="Unread" />
                  )}
                </span>
                <span className="mt-2 block text-xs font-semibold text-fg/40">
                  {new Date(n.created_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </>
            );
            const cls = `block rounded-2xl border p-4 ${
              n.is_read
                ? "border-fg/10 bg-card"
                : "border-lime/40 bg-card"
            }`;
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link href={n.link} className={`${cls} transition hover:border-lime/60`}>
                    {inner}
                  </Link>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
