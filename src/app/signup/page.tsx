"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    const supabase = getBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured yet. Add your keys to .env.local first.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Confirmation links must return to the live site, not localhost.
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (authError) throw authError;
      if (data.session) {
        router.push("/connect");
        router.refresh();
      } else {
        setNotice(
          "Account created! Check your email to confirm, then log in — you will land on the social connect step."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-white/15 bg-ink px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-sun";

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-white">
        Create your account
      </h1>
      <p className="mt-2 text-sm text-white/60">
        Email and password only — we never ask for your phone, address, or
        extra details.
      </p>
      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-xl bg-sun/10 px-4 py-3 text-sm font-semibold text-sun">
          Supabase is not configured yet — add NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see README).
        </p>
      )}
      <form
        onSubmit={submit}
        className="mt-6 rounded-3xl border border-white/10 bg-card p-6"
      >
        <label className="block text-sm font-bold text-white">
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
        <label className="mt-4 block text-sm font-bold text-white">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            className={inputCls}
          />
        </label>
        {error && (
          <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 rounded-xl bg-green-500/15 px-4 py-2.5 text-sm font-semibold text-green-300">
            {notice}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-full bg-sun py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-sundark disabled:opacity-40"
        >
          {busy ? "Creating account…" : "Sign up free"}
        </button>
        <p className="mt-4 text-center text-sm text-white/60">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-sun hover:underline">
            Log in
          </Link>
        </p>
        <p className="mt-3 text-center text-xs leading-relaxed text-white/40">
          By signing up you agree to the Terms of Service and Privacy Policy.
          Fake engagement will lead to your account being strictly blocked or
          banned.
        </p>
      </form>
    </div>
  );
}
