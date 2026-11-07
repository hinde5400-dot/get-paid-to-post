"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

/**
 * Reset password — reached from the email link, which lands on
 * /auth/callback?next=/reset-password and exchanges the code for a
 * session first, so updateUser works here.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    async function check() {
      const supabase = getBrowserClient();
      if (!supabase) {
        setHasSession(false);
        return;
      }
      const { data } = await supabase.auth.getUser();
      setHasSession(Boolean(data.user));
    }
    void check();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    const supabase = getBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured yet.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reset the password."
      );
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none placeholder:text-fg/30 focus:border-lime";

  if (hasSession === null) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-fg/60">Loading…</p>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="flex justify-center">
          <Logo href="/" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-black uppercase tracking-tight text-fg">
          Link expired
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fg/60">
          This password reset link is invalid or has expired. Request a new
          one and try again.
        </p>
        <Link
          href="/forgot-password"
          className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="flex justify-center">
        <Logo href="/" />
      </div>
      <h1 className="mt-6 text-center font-display text-4xl font-black uppercase leading-none tracking-tight text-fg">
        Set a new password
      </h1>
      <p className="mt-2 text-center text-sm text-fg/60">
        Choose a new password of at least 8 characters.
      </p>

      {done ? (
        <div className="mt-6 rounded-3xl border border-fg/10 bg-card p-6 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-3 text-lg font-bold text-fg">
            Password updated
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-fg/60">
            Your password has been changed. Log in with your new password.
          </p>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="mt-5 rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Log in
          </button>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="mt-6 rounded-3xl border border-fg/10 bg-card p-6"
        >
          <label className="block text-sm font-bold text-fg">
            New password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={inputCls}
            />
          </label>
          <label className="mt-4 block text-sm font-bold text-fg">
            Confirm new password
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat your new password"
              className={inputCls}
            />
          </label>
          {error && (
            <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-full bg-lime py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-limedark disabled:opacity-40"
          >
            {busy ? "Saving…" : "Reset password"}
          </button>
        </form>
      )}
    </div>
  );
}
