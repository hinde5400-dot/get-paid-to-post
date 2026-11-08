"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

/**
 * Step 2 after signup: connect TikTok / Instagram / YouTube accounts
 * through OAuth — no manual profile links. TikTok works today via
 * Login Kit; Instagram and YouTube cards are shown the same way and
 * switch on when their logins are ready.
 */
export default function ConnectPage() {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [tiktokStatus, setTiktokStatus] = useState<string | null>(null);
  const [tiktokConnected, setTiktokConnected] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // TikTok Login Kit returns here with ?tiktok=<status> (see
  // /api/auth/tiktok/callback). Read it from the URL so the page can
  // show what happened without a Suspense boundary.
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("tiktok");
    if (status) setTiktokStatus(status);
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = getBrowserClient();
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setLoading(false);
        return;
      }
      setLoggedIn(true);
      // Show the linked TikTok account, if one was saved through Login
      // Kit. The table only exists after migration 0016 is run, so a
      // missing table is ignored here instead of breaking the page.
      try {
        const { data: conn } = await supabase
          .from("tiktok_connections")
          .select("username, display_name")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const c = conn as { username?: string | null; display_name?: string | null } | null;
        if (c) {
          const name = c.username ?? c.display_name;
          if (name) {
            setTiktokConnected(name);
          } else {
            // Row exists but TikTok never returned a name (the
            // profile call failed during the callback) — re-read it
            // from TikTok now so the card shows the real account.
            try {
              const res = await fetch("/api/auth/tiktok/profile");
              if (res.ok) {
                const p = (await res.json()) as {
                  username?: string | null;
                  display_name?: string | null;
                };
                const refreshed = p.username ?? p.display_name;
                if (refreshed) setTiktokConnected(refreshed);
                else setTiktokConnected("your TikTok account");
              } else {
                setTiktokConnected("your TikTok account");
              }
            } catch {
              setTiktokConnected("your TikTok account");
            }
          }
        }
      } catch {
        // Table not set up yet — the TikTok card still works.
      }
      setLoading(false);
    }
    void load();
  }, []);

  async function disconnectTikTok() {
    if (
      !window.confirm(
        "Disconnect your TikTok account? You can reconnect anytime."
      )
    ) {
      return;
    }
    setDisconnecting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/tiktok", { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Could not disconnect TikTok.");
      }
      setTiktokConnected(null);
      setTiktokStatus("disconnected");
      showSuccess("TikTok disconnected.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not disconnect TikTok.";
      setError(message);
      showError(message);
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return <p className="text-fg/60">Loading…</p>;
  }

  if (!loggedIn) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-fg">Please log in first</h1>
        <p className="mt-2 text-sm text-fg/60">
          Connect your social profiles after you log in.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-bold text-ink"
        >
          Log in
        </Link>
      </div>
    );
  }

  const cardCls = "rounded-3xl border border-fg/10 bg-card p-6";

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Connect your profiles</h1>
      <p className="mt-2 text-sm text-fg/60">
        Step 2 — connect your TikTok, Instagram and YouTube accounts so
        your submitted clips can be matched to you.
      </p>
      {tiktokStatus && (
        <p
          className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold ${
            tiktokStatus === "connected"
              ? "bg-lime/15 text-lime"
              : "bg-red-500/15 text-red-300"
          }`}
        >
          {tiktokStatus === "connected"
            ? "TikTok connected — your account is linked."
            : tiktokStatus === "disconnected"
              ? "TikTok disconnected — your account is unlinked."
              : tiktokStatus === "not_configured"
                ? "TikTok login is not set up yet — the site owner still needs to add the TikTok keys."
                : tiktokStatus === "save_failed"
                  ? "TikTok login worked, but saving the connection failed — please try again. If it keeps failing, the database setup may not be done yet."
                  : tiktokStatus === "denied"
                    ? "You declined the TikTok login — nothing was connected."
                    : "TikTok login did not complete — please try again."}
        </p>
      )}

      {/* TikTok — live via Login Kit */}
      <div className={`mt-4 ${cardCls}`}>
        <h2 className="text-sm font-bold text-fg">Connect TikTok</h2>
        <p className="mt-1 text-sm text-fg/60">
          {tiktokConnected
            ? tiktokConnected === "your TikTok account"
              ? "Connected as your TikTok account. We use this only to verify your identity and read your own videos' view counts."
              : `Connected as @${tiktokConnected}. We use this only to verify your identity and read your own videos' view counts.`
            : "Log in with TikTok so we can verify your identity and read your own videos' view counts. We never post, edit or delete your videos."}
        </p>
        {tiktokConnected ? (
          <button
            type="button"
            onClick={disconnectTikTok}
            disabled={disconnecting}
            className="mt-4 inline-block rounded-full border border-red-500/50 px-6 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
          >
            {disconnecting ? "Disconnecting..." : "Disconnect TikTok"}
          </button>
        ) : (
          <a
            href="/api/auth/tiktok"
            className="mt-4 inline-block rounded-full bg-lime px-6 py-3 text-sm font-bold text-ink transition hover:bg-limedark"
          >
            Connect TikTok
          </a>
        )}
      </div>

      {/* Instagram — coming soon */}
      <div className={`mt-4 ${cardCls}`}>
        <h2 className="text-sm font-bold text-fg">Connect Instagram</h2>
        <p className="mt-1 text-sm text-fg/60">
          Log in with Instagram so we can verify your identity and read
          your own Reels&apos; view counts. We never post, edit or delete
          your videos.
        </p>
        <span className="mt-4 inline-block cursor-not-allowed rounded-full bg-fg/10 px-6 py-3 text-sm font-bold text-fg/40">
          Coming soon
        </span>
      </div>

      {/* YouTube — coming soon */}
      <div className={`mt-4 ${cardCls}`}>
        <h2 className="text-sm font-bold text-fg">Connect YouTube</h2>
        <p className="mt-1 text-sm text-fg/60">
          Log in with YouTube so we can verify your identity and read your
          own Shorts&apos; view counts. We never post, edit or delete your
          videos.
        </p>
        <span className="mt-4 inline-block cursor-not-allowed rounded-full bg-fg/10 px-6 py-3 text-sm font-bold text-fg/40">
          Coming soon
        </span>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        className="mt-6 flex w-full items-center justify-center rounded-full bg-lime py-3 text-sm font-bold text-ink transition hover:bg-limedark"
      >
        Go to dashboard
      </button>
    </div>
  );
}
