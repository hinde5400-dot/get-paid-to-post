"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import Spinner from "@/components/Spinner";

/** Forgot password — enter your email and we send a reset link. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const supabase = getBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured yet.");
      return;
    }
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    setBusy(true);
    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send the reset link."
      );
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none placeholder:text-fg/30 focus:border-lime";

  return (
    <div className="mx-auto max-w-md">
      <div className="flex justify-center">
        <Logo href="/" />
      </div>
      <h1 className="mt-6 text-center font-display text-4xl font-black uppercase leading-none tracking-tight text-fg">
        Forgot password
      </h1>
      <p className="mt-2 text-center text-sm text-fg/60">
        Enter the email you signed up with and we will send you a link to
        reset your password.
      </p>

      {sent ? (
        <div className="mt-6 rounded-3xl border border-fg/10 bg-card p-6 text-center">
          <p className="text-4xl">✉️</p>
          <p className="mt-3 text-lg font-bold text-fg">Check your email</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-fg/60">
            If an account exists for <span className="font-bold text-fg">{email}</span>,
            a password reset link is on its way. It expires in one hour.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Back to log in
          </Link>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="mt-6 rounded-3xl border border-fg/10 bg-card p-6"
        >
          <label className="block text-sm font-bold text-fg">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-limedark disabled:opacity-40"
          >
            {busy ? (
              <>
                <Spinner /> Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </button>
          <p className="mt-4 text-center text-sm text-fg/60">
            Remembered it?{" "}
            <Link href="/login" className="font-bold text-lime hover:underline">
              Log in
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
