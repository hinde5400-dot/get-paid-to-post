"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const supabase = getBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured yet. Add your keys to .env.local first.");
      return;
    }
    setBusy(true);
    try {
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (data.user) {
        // Blocked accounts cannot log in.
        const { data: profile } = await supabase
          .from("users")
          .select("is_blocked")
          .eq("id", data.user.id)
          .single();
        if ((profile as { is_blocked?: boolean } | null)?.is_blocked) {
          await supabase.auth.signOut();
          throw new Error(
            "This account is blocked. Please contact support."
          );
        }
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Log in failed.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none placeholder:text-fg/30 focus:border-lime";

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-fg">
        Welcome back
      </h1>
      <p className="mt-2 text-sm text-fg/60">
        Log in to your Get Paid To Post account.
      </p>
      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-xl bg-lime/10 px-4 py-3 text-sm font-semibold text-lime">
          Supabase is not configured yet — add NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see README).
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
          {busy ? "Logging in…" : "Log in"}
        </button>
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
