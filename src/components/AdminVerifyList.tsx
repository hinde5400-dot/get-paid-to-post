"use client";

import { useEffect, useState } from "react";

/**
 * Admin — bio-code manual verification queue (migration 0046).
 * Loads its own data from /api/admin/verify-profile so a failed
 * load is an honest message here, never a broken admin page.
 * Pending rows carry the creator's bio screenshot: the admin opens
 * the live profile, checks the code is in the bio, and approves —
 * or rejects (the creator starts over). Verified rows carry an
 * Unlock button for when a creator needs to change profiles.
 */

type VerifyRow = {
  id: string;
  user_id: string;
  platform: string;
  profile_url: string;
  handle: string;
  bio_code: string | null;
  verified_at: string | null;
  verified_by: string | null;
  proof_url: string | null;
  created_at: string;
  email: string;
};

export default function AdminVerifyList() {
  const [pending, setPending] = useState<VerifyRow[]>([]);
  const [verified, setVerified] = useState<VerifyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/verify-profile");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Could not load verifications.");
      }
      const body = (await res.json()) as {
        pending?: VerifyRow[];
        verified?: VerifyRow[];
      };
      setPending(body.pending ?? []);
      setVerified(body.verified ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load verifications."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(
    id: string,
    action: "approve" | "reject" | "unlock",
    confirmText?: string
  ) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(id);
    setNotice("");
    try {
      const res = await fetch("/api/admin/verify-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "That did not work — please try again.");
      }
      setNotice(
        action === "approve"
          ? "Profile verified."
          : action === "reject"
            ? "Verification rejected — the creator can start over."
            : "Profile unlocked — the creator can verify a different profile."
      );
      await load();
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "That did not work — please try again."
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-fg/60">Loading verifications…</p>;
  }
  if (error) {
    return (
      <p className="rounded-2xl border border-fg/10 bg-card p-5 text-sm text-fg/60">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {notice && (
        <p className="rounded-xl bg-lime/15 px-4 py-2.5 text-sm font-semibold text-lime">
          {notice}
        </p>
      )}
      {pending.length === 0 && verified.length === 0 && (
        <p className="rounded-2xl border border-fg/10 bg-card p-5 text-sm text-fg/60">
          No profile verifications yet. When a creator&apos;s bio
          cannot be read automatically, their screenshot lands here
          for your check.
        </p>
      )}
      {pending.map((row) => (
        <div
          key={row.id}
          className="rounded-2xl border border-amber-500/30 bg-card p-5"
        >
          <p className="text-sm font-bold text-fg">
            {row.platform} — @{row.handle}
            <span className="ml-2 font-normal text-fg/60">{row.email}</span>
          </p>
          <p className="mt-1 text-sm text-fg/60">
            Code:{" "}
            <code className="font-mono font-bold text-fg">
              {row.bio_code ?? "—"}
            </code>
          </p>
          <p className="mt-2 flex flex-wrap gap-3 text-sm">
            <a
              href={row.profile_url}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-lime underline"
            >
              Open live profile ↗
            </a>
            {row.proof_url && (
              <a
                href={row.proof_url}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-lime underline"
              >
                Open bio screenshot ↗
              </a>
            )}
          </p>
          <p className="mt-2 text-xs text-fg/50">
            Open the live profile, check the code is in the bio, then
            approve. Reject if the code is not there.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => act(row.id, "approve")}
              disabled={busyId === row.id}
              className="rounded-full bg-lime px-5 py-2 text-sm font-bold text-ink transition hover:bg-limedark disabled:opacity-40"
            >
              {busyId === row.id ? "Working..." : "Approve"}
            </button>
            <button
              type="button"
              onClick={() =>
                act(row.id, "reject", "Reject this verification? The creator will need to start over.")
              }
              disabled={busyId === row.id}
              className="rounded-full border border-red-500/50 px-5 py-2 text-sm font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
      {verified.length > 0 && (
        <div className="pt-2">
          <p className="text-sm font-bold text-fg">
            Verified profiles ({verified.length})
          </p>
          <div className="mt-2 space-y-2">
            {verified.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-fg/10 bg-card px-4 py-3"
              >
                <p className="text-sm text-fg/70">
                  <span className="font-bold text-fg">
                    {row.platform} — @{row.handle}
                  </span>{" "}
                  {row.email} · verified{" "}
                  {row.verified_at
                    ? new Date(row.verified_at).toLocaleDateString()
                    : ""}{" "}
                  ({row.verified_by ?? "—"})
                </p>
                <button
                  type="button"
                  onClick={() =>
                    act(
                      row.id,
                      "unlock",
                      `Unlock @${row.handle}? The creator will need to verify a profile again before submitting on ${row.platform}.`
                    )
                  }
                  disabled={busyId === row.id}
                  className="rounded-full border border-fg/20 px-4 py-1.5 text-xs font-bold text-fg transition hover:bg-fg/10 disabled:opacity-40"
                >
                  Unlock
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
