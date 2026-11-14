"use client";

import Link from "next/link";
import type { AdminUserRow } from "@/lib/data";
import { PLATFORM_LABELS } from "@/lib/constants";
import WarnCreatorButton from "@/components/WarnCreatorButton";

/**
 * Users directory inside the Creators tab (admin tabs): every
 * user, with a filter (all / brand / creator / admin / blocked)
 * and, per user, which accounts are connected via bio-code
 * verification (verified_profiles — a ticked platform means the
 * profile is locked to this user), how many warnings they have,
 * and the Warning button. A user who never submitted anything
 * is invisible everywhere else on /admin — this is the only
 * place they show.
 */
export default function AdminUsersDirectory({
  users,
  userFilter,
  verifiedByUser,
  warningCounts,
}: {
  users: AdminUserRow[];
  userFilter: string;
  verifiedByUser: Record<
    string,
    { platform: string; handle: string; verified_at: string | null }[]
  >;
  warningCounts: Record<string, number>;
}) {
  const filters = ["all", "brand", "creator", "admin", "blocked"] as const;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg font-black uppercase tracking-tight text-fg">
          All users
        </h3>
        <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
          {users.length} shown
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {filters.map((value) => (
            <Link
              key={value}
              href={`/admin?tab=creators&userFilter=${value}`}
              className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition ${
                userFilter === value
                  ? "bg-red-500 text-white"
                  : "border border-fg/15 text-fg/70 hover:border-red-400/60 hover:text-fg"
              }`}
            >
              {value}
            </Link>
          ))}
        </div>
      </div>

      {users.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-fg/10 bg-card p-5 text-sm text-fg/60">
          No users match this filter.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {users.map((u) => {
            const verified = (verifiedByUser[u.id] ?? []).filter(
              (p) => p.verified_at
            );
            const pending = (verifiedByUser[u.id] ?? []).filter(
              (p) => !p.verified_at
            );
            const warnings = warningCounts[u.id] ?? 0;
            return (
              <div
                key={u.id}
                className="rounded-2xl border border-fg/10 bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-bold text-fg">{u.email}</p>
                    <p className="mt-1 text-xs text-fg/50">
                      {u.role}
                      {u.is_admin ? " · admin" : ""}
                      {u.is_blocked ? " · BLOCKED" : ""} · joined{" "}
                      {new Date(u.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      {(["tiktok", "instagram", "youtube"] as const).map(
                        (platform) => {
                          const row = verified.find(
                            (p) => p.platform === platform
                          );
                          const pendingRow = pending.find(
                            (p) => p.platform === platform
                          );
                          return (
                            <span
                              key={platform}
                              title={
                                row
                                  ? `${PLATFORM_LABELS[platform]} connected as ${row.handle}`
                                  : pendingRow
                                    ? `${PLATFORM_LABELS[platform]} code issued, not verified yet`
                                    : `${PLATFORM_LABELS[platform]} not connected`
                              }
                              className={`rounded-full px-2 py-0.5 font-bold ${
                                row
                                  ? "bg-lime/15 text-limeink"
                                  : pendingRow
                                    ? "bg-amber-500/15 text-amber-300"
                                    : "bg-fg/10 text-fg/50"
                              }`}
                            >
                              {row
                                ? `✓ ${PLATFORM_LABELS[platform]}`
                                : pendingRow
                                  ? `… ${PLATFORM_LABELS[platform]}`
                                  : `✕ ${PLATFORM_LABELS[platform]}`}
                            </span>
                          );
                        }
                      )}
                      {warnings > 0 && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-bold text-amber-300">
                          ⚠ {warnings} warning{warnings === 1 ? "" : "s"}
                        </span>
                      )}
                    </p>
                  </div>
                  <WarnCreatorButton userId={u.id} email={u.email} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
