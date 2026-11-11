"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import RoleCards from "@/components/RoleCards";
import Spinner from "@/components/Spinner";
import { useToast } from "@/components/Toast";

type Role = "creator" | "brand";

/**
 * Signup, split into exactly two roles. Without a role the page
 * shows ONLY the two role cards — no other signup button. With a
 * role, the form adapts: creators sign up with Full Name and go to
 * onboarding; brands sign up with Brand Name and go straight to the
 * campaign form (/brands). The role is stored in the auth metadata
 * (and copied to public.users by migration 0008).
 */
export default function SignupForm({ role }: { role: Role | null }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // Already signed in? (friend's brand test, 2026-11-11): the
  // friend was logged in on his own phone and could not tell why
  // signup "did nothing" while he was already signed in. Say it
  // plainly above the form — do NOT block signup and do NOT redirect.
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supabase = getBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user?.email) setSignedInEmail(data.user.email);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOutFirst() {
    const supabase = getBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setSignedInEmail(null);
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    const supabase = getBrowserClient();
    if (!supabase) {
      showError("Supabase is not configured yet. Add your keys to .env.local first.");
      return;
    }
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      showError("This field is required");
      return;
    }
    if (password.length < 8) {
      showError("Password must be 8+ characters");
      return;
    }
    if (password !== confirmPassword) {
      showError("Passwords do not match.");
      return;
    }
    if (!agreeTerms) {
      showError("Please agree to the Terms of Service to continue.");
      return;
    }
    setBusy(true);
    try {
      const next = role === "brand" ? "/brands" : "/onboarding";
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data:
            role === "brand"
              ? {
                  full_name: name.trim(),
                  role: "brand",
                  brand_name: name.trim(),
                }
              : { full_name: name.trim(), role: "creator" },
          // Confirmation links must return to the live site (not
          // localhost) and land on the next step for the role.
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
        },
      });
      if (authError) {
        if (/already registered/i.test(authError.message)) {
          throw new Error(
            "This email is already registered. Try logging in."
          );
        }
        throw authError;
      }
      if (data.session) {
        // Signed straight in — creators go to onboarding, brands go
        // straight to the campaign form.
        showSuccess("Account created!");
        router.push(next);
        router.refresh();
      } else {
        showSuccess("Account created! Check your email to confirm.");
        setNotice(
          role === "brand"
            ? "Account created! Check your email to confirm, then log in — you will land on the campaign form."
            : "Account created! Check your email to confirm, then log in — you will land on the onboarding step where you connect your profiles."
        );
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none placeholder:text-fg/30 focus:border-lime";

  // No role picked yet — the two cards are the whole signup entry.
  if (!role) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex justify-center">
          <Logo href="/" />
        </div>
        <h1 className="mt-6 text-center font-display text-4xl font-black uppercase leading-none tracking-tight text-fg">
          Join Get Paid To Post
        </h1>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-fg/60">
          Pick your side — creator or brand. Sign up with email and
          password — we never ask for your phone, address,
          or extra details.
        </p>
        <div className="mt-7">
          <RoleCards />
        </div>
        <p className="mt-6 text-center text-sm text-fg/60">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-lime hover:underline">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  const nameLabel = role === "brand" ? "Brand Name" : "Full Name";
  const namePlaceholder =
    role === "brand" ? "Your brand name" : "Your full name";

  return (
    <div className="mx-auto max-w-md">
      <div className="flex justify-center">
        <Logo href="/" />
      </div>
      <h1 className="mt-6 text-center font-display text-4xl font-black uppercase leading-none tracking-tight text-fg">
        {role === "brand"
          ? "Create your brand account"
          : "Create your creator account"}
      </h1>
      <p className="mt-2 text-center text-sm text-fg/60">
        {role === "brand"
          ? "Launch a campaign and get real clips from creators. Sign up with email and password."
          : "Post clips, get paid per view. Sign up with email and password."}
      </p>
      <p className="mt-3 text-center text-sm">
        <Link href="/signup" className="font-bold text-lime hover:underline">
          ← Back to roles
        </Link>
      </p>
      {role === "creator" && (
        <p className="mt-4 rounded-xl bg-fg/5 px-4 py-2.5 text-center text-xs leading-relaxed text-fg/60">
          Payouts are for creators aged 18 and older. By signing up you
          confirm you are 18 or older to receive payouts.
        </p>
      )}
      <p className="mt-4 rounded-xl bg-fg/5 px-4 py-2.5 text-center text-xs leading-relaxed text-fg/60">
        By signing up you confirm this is your only account — one account
        per person.
      </p>
      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-xl bg-lime/10 px-4 py-3 text-sm font-semibold text-lime">
          Supabase is not configured yet — add NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see README).
        </p>
      )}
      {signedInEmail && (
        <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-200">
          You are signed in as {signedInEmail}. To sign up as a brand,{" "}
          <button
            type="button"
            onClick={() => void signOutFirst()}
            className="font-bold text-lime underline hover:no-underline"
          >
            sign out
          </button>{" "}
          first — one account per person.
        </p>
      )}
      <form
        onSubmit={submit}
        className="mt-6 rounded-3xl border border-fg/10 bg-card p-6"
      >
        <label className="block text-sm font-bold text-fg">
          {nameLabel}
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={namePlaceholder}
            autoComplete="organization"
            className={inputCls}
          />
        </label>
        <label className="mt-4 block text-sm font-bold text-fg">
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className={inputCls}
          />
        </label>
        <label className="mt-4 block text-sm font-bold text-fg">
          Confirm Password
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
            className={inputCls}
          />
        </label>
        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-fg/80">
          <input
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#C6FF00]"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="font-bold text-lime hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-bold text-lime hover:underline">
              Privacy Policy
            </Link>
          </span>
        </label>
        {notice && (
          <p className="mt-4 rounded-xl bg-green-500/15 px-4 py-2.5 text-sm font-semibold text-green-300">
            {notice}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-limedark disabled:opacity-40"
        >
          {busy ? (
            <>
              <Spinner /> Loading...
            </>
          ) : (
            "Sign up free"
          )}
        </button>
        <p className="mt-4 text-center text-sm text-fg/60">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-lime hover:underline">
            Log in
          </Link>
        </p>
        <p className="mt-3 text-center text-xs leading-relaxed text-fg/40">
          Fake engagement will lead to your account being strictly blocked or
          banned.
        </p>
      </form>
    </div>
  );
}
