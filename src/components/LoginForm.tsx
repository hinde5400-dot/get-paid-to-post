"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import Spinner from "@/components/Spinner";
import { useToast } from "@/components/Toast";

// Modest client-side lockout: 5 failed logins disable the form for
// 60 seconds with a countdown. Supabase Auth also rate-limits its
// endpoints server-side; this is only the visible layer.
const LOCKOUT_AFTER = 5;
const LOCKOUT_SECONDS = 60;
const FAILS_KEY = "gptp-login-fails";

function readFails(): { count: number; lockedUntil: number } {
  try {
    const raw = localStorage.getItem(FAILS_KEY);
    if (!raw) return { count: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as { count?: number; lockedUntil?: number };
    return {
      count: Number(parsed.count ?? 0),
      lockedUntil: Number(parsed.lockedUntil ?? 0),
    };
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showError, showSuccess } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [lockLeft, setLockLeft] = useState(0);

  useEffect(() => {
    const { lockedUntil: until } = readFails();
    if (until > Date.now()) setLockedUntil(until);
  }, []);

  // Countdown while locked.
  useEffect(() => {
    if (!lockedUntil) return;
    function tick() {
      const left = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setLockLeft(left);
      if (left <= 0) {
        setLockedUntil(0);
        try {
          localStorage.removeItem(FAILS_KEY);
        } catch {
          // Ignore storage errors.
        }
      }
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const locked = lockedUntil > Date.now() && lockLeft > 0;

  function recordFailedAttempt() {
    const { count } = readFails();
    const next = count + 1;
    if (next >= LOCKOUT_AFTER) {
      const until = Date.now() + LOCKOUT_SECONDS * 1000;
      try {
        localStorage.setItem(
          FAILS_KEY,
          JSON.stringify({ count: 0, lockedUntil: until })
        );
      } catch {
        // Ignore storage errors.
      }
      setLockedUntil(until);
      showError(
        `Too many failed attempts. Try again in ${LOCKOUT_SECONDS} seconds.`
      );
    } else {
      try {
        localStorage.setItem(
          FAILS_KEY,
          JSON.stringify({ count: next, lockedUntil: 0 })
        );
      } catch {
        // Ignore storage errors.
      }
    }
  }

  // Shown when middleware redirects a guest away from a protected page,
  // or when the auth callback bounces a blocked account.
  const noticeMessage = searchParams.get("message");
  const notice =
    noticeMessage === "login-required"
      ? "Please login to continue."
      : noticeMessage === "account-blocked"
        ? "This account is blocked. Please contact support."
        : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    // Return to where the user was going (?next=, set by the
    // middleware for protected pages) — same validation as
    // safeNext() in src/app/auth/callback/route.ts: only relative
    // in-site paths, never an off-site redirect.
    const rawNext = searchParams.get("next");
    const next =
      rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
        ? rawNext
        : null;
    const supabase = getBrowserClient();
    if (!supabase) {
      showError("Supabase is not configured yet. Add your keys to .env.local first.");
      return;
    }
    if (!email.trim() || !password) {
      showError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        if (/not confirmed/i.test(authError.message)) {
          throw new Error(
            "Please confirm your email first — check your inbox for the confirmation link."
          );
        }
        throw new Error("Wrong email or password");
      }
      if (data.user) {
        // Blocked accounts cannot log in.
        const { data: profile } = await supabase
          .from("users")
          .select("is_blocked, role")
          .eq("id", data.user.id)
          .single();
        if ((profile as { is_blocked?: boolean } | null)?.is_blocked) {
          await supabase.auth.signOut();
          throw new Error(
            "This account is blocked. Please contact support."
          );
        }
        // Brands land on the campaign form, not the creator
        // dashboard. The profile row (migration 0008) is the source
        // of truth; the signup metadata is the fallback for rows
        // written before it.
        const role =
          (profile as { role?: string | null } | null)?.role ??
          data.user.user_metadata?.role;
        if (role === "brand") {
          showSuccess("Welcome back!");
          try {
            localStorage.removeItem(FAILS_KEY);
          } catch {
            // Ignore storage errors.
          }
          router.push(next ?? "/brands");
          router.refresh();
          return;
        }
      }
      showSuccess("Welcome back!");
      try {
        localStorage.removeItem(FAILS_KEY);
      } catch {
        // Ignore storage errors.
      }
      router.push(next ?? "/dashboard");
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Wrong email or password");
      recordFailedAttempt();
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
        Welcome back
      </h1>
      <p className="mt-2 text-center text-sm text-fg/60">
        Log in to your Get Paid To Post account.
      </p>
      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-xl bg-lime/10 px-4 py-3 text-sm font-semibold text-lime">
          Supabase is not configured yet — add NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see README).
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-xl bg-lime/10 px-4 py-3 text-center text-sm font-semibold text-lime">
          {notice}
        </p>
      )}
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
        <label className="mt-4 block text-sm font-bold text-fg">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className={inputCls}
          />
        </label>
        <div className="mt-3 text-right">
          <Link
            href="/forgot-password"
            className="text-sm font-bold text-lime hover:underline"
          >
            Forgot Password?
          </Link>
        </div>
        <button
          type="submit"
          disabled={busy || locked}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-limedark disabled:opacity-40"
        >
          {locked ? (
            `Try again in ${lockLeft}s`
          ) : busy ? (
            <>
              <Spinner /> Loading...
            </>
          ) : (
            "Log in"
          )}
        </button>
        {locked && (
          <p className="mt-3 text-center text-sm font-semibold text-red-300">
            Too many failed attempts — login is locked for {lockLeft}{" "}
            seconds.
          </p>
        )}
        <p className="mt-4 text-center text-sm text-fg/60">
          No account yet?{" "}
          <Link href="/signup" className="font-bold text-lime hover:underline">
            Sign up free
          </Link>
        </p>
      </form>
    </div>
  );
}

export default LoginForm;
