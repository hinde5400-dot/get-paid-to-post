"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

/**
 * Step 2 after signup: connect TikTok / Instagram / YouTube accounts
 * through OAuth — no manual profile links. TikTok works today via
 * Login Kit, YouTube via Google OAuth; the Instagram card is shown
 * the same way and switches on when its login is ready.
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
  const [youtubeStatus, setYoutubeStatus] = useState<string | null>(null);
  const [youtubeConnected, setYoutubeConnected] = useState<string | null>(
    null
  );
  const [disconnectingYoutube, setDisconnectingYoutube] = useState(false);

  // TikTok Login Kit returns here with ?tiktok=<status> (see
  // /api/auth/tiktok/callback). Read it from the URL so the page can
  // show what happened without a Suspense boundary.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tiktok = params.get("tiktok");
    if (tiktok) setTiktokStatus(tiktok);
    const youtube = params.get("youtube");
    if (youtube) setYoutubeStatus(youtube);
  }, []);

  // P2-13: validate a NAMED connection's token on load. A stored
  // name only proves the token worked at connect time — a token
  // revoked or expired since then still shows "Connected" from
  // the row alone. These helpers ask the profile endpoint for a
  // LIVE check (?validate=1) and return the confirmed name, or
  // null when the token could not be confirmed (dead token, no
  // name returned, or the endpoint failed). The caller maps null
  // to "saved-reconnect" instead of claiming "Connected".
  // The server half honours ?validate=1 with a real provider call
  // in both profile endpoints, so a revoked token now correctly
  // shows "Saved — couldn't confirm, reconnect" here.
  async function fetchConfirmedTikTokName(): Promise<string | null> {
    try {
      const res = await fetch("/api/auth/tiktok/profile?validate=1");
      if (!res.ok) return null;
      const p = (await res.json()) as {
        connected?: boolean;
        username?: string | null;
        display_name?: string | null;
      };
      if (p.connected === false) return null;
      return p.username ?? p.display_name ?? null;
    } catch {
      return null;
    }
  }

  async function fetchConfirmedYouTubeName(): Promise<string | null> {
    try {
      const res = await fetch("/api/auth/youtube/profile?validate=1");
      if (!res.ok) return null;
      const p = (await res.json()) as {
        connected?: boolean;
        channel_title?: string | null;
        channel_handle?: string | null;
      };
      if (p.connected === false) return null;
      return p.channel_title ?? p.channel_handle ?? null;
    } catch {
      return null;
    }
  }

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
            // Row has a name — validate the token before claiming
            // "Connected" (P2-13). A null here means the login
            // could not be confirmed: show "Saved — couldn't
            // confirm, reconnect" instead of a stale "Connected".
            const confirmed = await fetchConfirmedTikTokName();
            setTiktokConnected(confirmed ?? "saved-reconnect");
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
                // The profile re-fetch failed or returned no name:
                // do NOT claim "Connected as @…" — the row is saved
                // but unverified, and the creator finds out at
                // submit. Say so plainly instead.
                else setTiktokConnected("saved-unverified");
              } else {
                setTiktokConnected("saved-unverified");
              }
            } catch {
              setTiktokConnected("saved-unverified");
            }
          }
        }
      } catch {
        // Table not set up yet — the TikTok card still works.
      }
      // Show the linked YouTube channel, if one was saved through
      // Google OAuth. The table only exists after migration 0019 is
      // run, so a missing table is ignored here instead of breaking
      // the page.
      try {
        const { data: ytConn } = await supabase
          .from("youtube_connections")
          .select("channel_title, channel_handle")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const y = ytConn as {
          channel_title?: string | null;
          channel_handle?: string | null;
        } | null;
        if (y) {
          const name = y.channel_title ?? y.channel_handle;
          if (name) {
            // Row has a name — validate the token before claiming
            // "Connected" (P2-13), same as TikTok above.
            const confirmed = await fetchConfirmedYouTubeName();
            setYoutubeConnected(confirmed ?? "saved-reconnect");
          } else {
            // Row exists but Google never returned a channel title
            // (the channels call failed during the callback) —
            // re-read it from Google now so the card shows the real
            // channel.
            try {
              const res = await fetch("/api/auth/youtube/profile");
              if (res.ok) {
                const p = (await res.json()) as {
                  channel_title?: string | null;
                  channel_handle?: string | null;
                };
                const refreshed = p.channel_title ?? p.channel_handle;
                if (refreshed) setYoutubeConnected(refreshed);
                // The profile re-fetch failed or returned no name:
                // do NOT claim "Connected as …" — the row is saved
                // but unverified, and the creator finds out at
                // submit. Say so plainly instead.
                else setYoutubeConnected("saved-unverified");
              } else {
                setYoutubeConnected("saved-unverified");
              }
            } catch {
              setYoutubeConnected("saved-unverified");
            }
          }
        }
      } catch {
        // Table not set up yet — the YouTube card still works.
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

  async function disconnectYouTube() {
    if (
      !window.confirm(
        "Disconnect your YouTube channel? You can reconnect anytime."
      )
    ) {
      return;
    }
    setDisconnectingYoutube(true);
    setError("");
    try {
      const res = await fetch("/api/auth/youtube", { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Could not disconnect YouTube.");
      }
      setYoutubeConnected(null);
      setYoutubeStatus("disconnected");
      showSuccess("YouTube disconnected.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not disconnect YouTube.";
      setError(message);
      showError(message);
    } finally {
      setDisconnectingYoutube(false);
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
        Step 2 — connect your TikTok and YouTube accounts so your
        submitted clips can be matched to you. Only videos from your
        own connected TikTok and YouTube accounts count — a link to
        someone else&apos;s video will not earn. (Instagram connects
        later.)
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

      {/* TikTok — live via Login Kit (Sandbox: only the test
          account can connect until TikTok approves our app) */}
      <div className={`mt-4 ${cardCls}`}>
        <h2 className="text-sm font-bold text-fg">Connect TikTok</h2>
        <p className="mt-1 text-sm text-fg/60">
          {tiktokConnected
            ? tiktokConnected === "saved-unverified"
              ? "Saved — we couldn't confirm the account name, so verify it at submit: only videos from your own connected TikTok account count. We use this only to verify your identity and read your own videos' view counts."
              : tiktokConnected === "saved-reconnect"
                ? "Saved — we couldn't confirm this login, so reconnect it: only videos from your own connected TikTok account count. We use this only to verify your identity and read your own videos' view counts."
                : `Connected as @${tiktokConnected}. We use this only to verify your identity and read your own videos' view counts.`
            : "Log in with TikTok so we can verify your identity and read your own videos' view counts. We never post, edit or delete your videos."}
        </p>
        <p className="mt-3 rounded-xl bg-amber-500/10 px-4 py-2.5 text-sm font-semibold leading-relaxed text-amber-200">
          TikTok login is still in review (Sandbox) — only the test
          account (nagu6503) can connect until TikTok approves our app.
          If your login fails, that is why.
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
        <p className="mt-2 text-sm font-semibold text-fg/60">
          Instagram login isn&apos;t ready yet — connect it here once
          it&apos;s live.
        </p>
        <span className="mt-4 inline-block cursor-not-allowed rounded-full bg-fg/10 px-6 py-3 text-sm font-bold text-fg/40">
          Coming soon
        </span>
      </div>

      {/* YouTube — live via Google OAuth (app unverified, 100-user cap) */}
      <div className={`mt-4 ${cardCls}`}>
        <h2 className="text-sm font-bold text-fg">Connect YouTube</h2>
        <p className="mt-1 text-sm text-fg/60">
          {youtubeConnected
            ? youtubeConnected === "saved-unverified"
              ? "Saved — we couldn't confirm the channel name, so verify it at submit: only videos from your own connected YouTube channel count. We use this only to verify your identity and read your own videos' view counts."
              : youtubeConnected === "saved-reconnect"
                ? "Saved — we couldn't confirm this login, so reconnect it: only videos from your own connected YouTube channel count. We use this only to verify your identity and read your own videos' view counts."
                : `Connected as ${youtubeConnected}. We use this only to verify your identity and read your own videos' view counts.`
            : "Log in with Google so we can verify your YouTube channel and read your own videos' view counts. Only videos from your connected channel count — we never post, edit or delete your videos."}
        </p>
        <p className="mt-3 rounded-xl bg-amber-500/10 px-4 py-2.5 text-sm font-semibold leading-relaxed text-amber-200">
          Our Google app is still unverified — Google will show a
          warning screen before you connect, and only the first 100
          accounts can connect until verification finishes.
        </p>
        {youtubeConnected ? (
          <button
            type="button"
            onClick={disconnectYouTube}
            disabled={disconnectingYoutube}
            className="mt-4 inline-block rounded-full border border-red-500/50 px-6 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
          >
            {disconnectingYoutube ? "Disconnecting..." : "Disconnect YouTube"}
          </button>
        ) : (
          <a
            href="/api/auth/youtube"
            className="mt-4 inline-block rounded-full bg-lime px-6 py-3 text-sm font-bold text-ink transition hover:bg-limedark"
          >
            Connect YouTube
          </a>
        )}
      </div>

      {youtubeStatus && (
        <p
          className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold ${
            youtubeStatus === "connected"
              ? "bg-lime/15 text-lime"
              : "bg-red-500/15 text-red-300"
          }`}
        >
          {youtubeStatus === "connected"
            ? "YouTube connected — your channel is linked."
            : youtubeStatus === "disconnected"
              ? "YouTube disconnected — your channel is unlinked."
              : youtubeStatus === "not_configured"
                ? "YouTube login is not set up yet — the site owner still needs to add the Google keys."
                : youtubeStatus === "save_failed"
                  ? "YouTube login worked, but saving the connection failed — please try again. If it keeps failing, the database setup may not be done yet."
                  : youtubeStatus === "no_channel"
                    ? "No YouTube channel was found on this Google account — connect with the Google account that owns your channel."
                    : youtubeStatus === "denied"
                      ? "You declined the Google login — nothing was connected."
                      : "YouTube login did not complete — please try again."}
        </p>
      )}

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
