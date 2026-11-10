"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";
import { useToast } from "@/components/Toast";

type Role = "brand" | "creator";

/** The Google "G" logo (official four colours), inline — no image asset. */
function GoogleGIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.58v3h3.86c2.26-2.08 3.56-5.15 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.86-3c-1.07.72-2.44 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.29V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.43-3.43A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

/**
 * Continue with Google — Supabase OAuth (Google provider, configured
 * in the Supabase dashboard with a dedicated OAuth client; no secret
 * lives in code and no new env var is needed).
 *
 * The `role` is the role picked on the signup page (brand/creator).
 * signInWithOAuth cannot carry user metadata, so the role travels in
 * the callback URL (?role=brand) and /auth/callback applies it to the
 * new account — see that route for why it goes into auth metadata.
 * `next` is where the user lands after the callback (brands go to
 * /brands, creators to /onboarding, logins to /dashboard).
 *
 * An existing user signing in with the same (Google-verified) email
 * lands on their existing account: GoTrue links the Google identity
 * to the existing user instead of creating a duplicate (default
 * behaviour while "Allow duplicate emails" stays off in the
 * Supabase dashboard).
 */
export default function GoogleSignInButton({
  role,
  next,
}: {
  role?: Role | null;
  next?: string;
}) {
  const { showError } = useToast();
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    const supabase = getBrowserClient();
    if (!supabase) {
      showError(
        "Supabase is not configured yet. Add your keys to .env.local first."
      );
      return;
    }
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (next) params.set("next", next);
      if (role) params.set("role", role);
      const query = params.toString();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback${
            query ? `?${query}` : ""
          }`,
        },
      });
      if (error) throw error;
      // The browser leaves for Google; the callback finishes the sign-in.
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Google sign-in failed."
      );
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signInWithGoogle}
      disabled={busy}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-black/10 bg-white py-3 text-sm font-bold text-[#1f1f1f] transition hover:bg-gray-100 disabled:opacity-50"
    >
      {busy ? (
        <>
          <Spinner /> Redirecting to Google...
        </>
      ) : (
        <>
          <GoogleGIcon /> Continue with Google
        </>
      )}
    </button>
  );
}
