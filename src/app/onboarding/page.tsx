"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { hostnameOf } from "@/lib/validate";
import {
  TikTokIcon,
  InstagramIcon,
  YouTubeIcon,
} from "@/components/PlatformIcons";
import Spinner from "@/components/Spinner";
import { useToast } from "@/components/Toast";

/**
 * Onboarding — the step every new user lands on right after signup
 * (login is unchanged: existing users go to /dashboard).
 * One paste card: Instagram — the only pasted link that is ever
 * used (the submit-time handle gate reads users.instagram_url).
 * TikTok and YouTube have NO paste card here: pasted TikTok/YouTube
 * links were dead data (nothing ever read tiktok_url / youtube_url),
 * and matching on those platforms needs the OAuth login on
 * /connect instead — so those two cards send creators to /connect.
 * At least 1 connection is required to continue; Skip is also
 * offered. Then: "Welcome! Now Browse Campaigns" → Discover.
 * An OAuth connection made on /connect counts toward Continue
 * exactly like the Instagram paste — the cards below show the
 * connected state instead of always offering "Connect with login".
 */

type PlatformKey = "tiktok" | "instagram" | "youtube";

const PLATFORMS: {
  key: PlatformKey;
  name: string;
  domain: string;
  placeholder: string;
  Icon: (props: { className?: string }) => JSX.Element;
}[] = [
  {
    key: "instagram",
    name: "Instagram",
    domain: "instagram.com",
    placeholder: "https://www.instagram.com/you",
    Icon: InstagramIcon,
  },
];

// TikTok / YouTube are NOT paste cards: pasted links for them were
// never read anywhere, and matching needs the OAuth login on
// /connect. These cards send creators there instead.
const OAUTH_PLATFORMS: {
  key: "tiktok" | "youtube";
  name: string;
  Icon: (props: { className?: string }) => JSX.Element;
}[] = [
  { key: "tiktok", name: "TikTok", Icon: TikTokIcon },
  { key: "youtube", name: "YouTube", Icon: YouTubeIcon },
];

const FIELD: Record<PlatformKey, "tiktok_url" | "instagram_url" | "youtube_url"> = {
  tiktok: "tiktok_url",
  instagram: "instagram_url",
  youtube: "youtube_url",
};

export default function OnboardingPage() {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [urls, setUrls] = useState<Record<PlatformKey, string>>({
    tiktok: "",
    instagram: "",
    youtube: "",
  });
  const [connected, setConnected] = useState<Record<PlatformKey, boolean>>({
    tiktok: false,
    instagram: false,
    youtube: false,
  });
  const [profileExists, setProfileExists] = useState(false);
  // OAuth connections made on /connect (same tables /connect reads:
  // tiktok_connections, youtube_connections). The value is the
  // account/channel name when known, or "saved" when a row exists
  // but no name could be confirmed — either way the account is
  // linked and counts toward Continue.
  const [oauthNames, setOauthNames] = useState<{
    tiktok: string | null;
    youtube: string | null;
  }>({ tiktok: null, youtube: null });
  const [oauthUnconfirmed, setOauthUnconfirmed] = useState<{
    tiktok: boolean;
    youtube: boolean;
  }>({ tiktok: false, youtube: false });
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<PlatformKey | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

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
      const { data: profile } = await supabase
        .from("users")
        .select("tiktok_url, instagram_url, youtube_url")
        .eq("id", data.user.id)
        .single();
      const p = profile as {
        tiktok_url?: string | null;
        instagram_url?: string | null;
        youtube_url?: string | null;
      } | null;
      if (p) {
        setProfileExists(true);
        setUrls({
          tiktok: p.tiktok_url ?? "",
          instagram: p.instagram_url ?? "",
          youtube: p.youtube_url ?? "",
        });
        setConnected({
          tiktok: Boolean(p.tiktok_url),
          instagram: Boolean(p.instagram_url),
          youtube: Boolean(p.youtube_url),
        });
      }
      // OAuth connections (P1-C1): same check /connect does — a
      // saved row in tiktok_connections / youtube_connections,
      // with the name confirmed live via the profile endpoint
      // (?validate=1). A stored name whose token could not be
      // confirmed still counts as linked (the creator can
      // reconnect on /connect); it is shown as "Saved", never as
      // a confirmed "Connected as @…".
      const loadOAuth = async (
        table: "tiktok_connections" | "youtube_connections",
        nameFields: string[],
        profileUrl: string,
        key: "tiktok" | "youtube"
      ) => {
        try {
          const { data: conn } = await supabase
            .from(table)
            .select(nameFields.join(", "))
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const c = conn as Record<string, string | null> | null;
          if (!c) return;
          const stored =
            nameFields.map((f) => c[f]).find((v) => v?.trim()) ?? null;
          let name: string | null = null;
          let unconfirmed = false;
          try {
            const res = await fetch(`${profileUrl}?validate=1`);
            if (res.ok) {
              const prof = (await res.json()) as {
                connected?: boolean;
                username?: string | null;
                display_name?: string | null;
                channel_title?: string | null;
                channel_handle?: string | null;
              };
              if (prof.connected !== false) {
                name =
                  prof.username ??
                  prof.display_name ??
                  prof.channel_title ??
                  prof.channel_handle ??
                  null;
              }
            }
          } catch {
            // Validation failed — fall back to the stored name.
          }
          if (!name && stored) {
            name = stored;
            unconfirmed = true;
          } else if (!name) {
            // Row exists but no name anywhere: try the plain
            // profile re-read once, like /connect does.
            try {
              const res = await fetch(profileUrl);
              if (res.ok) {
                const prof = (await res.json()) as {
                  username?: string | null;
                  display_name?: string | null;
                  channel_title?: string | null;
                  channel_handle?: string | null;
                };
                name =
                  prof.username ??
                  prof.display_name ??
                  prof.channel_title ??
                  prof.channel_handle ??
                  null;
                if (!name) unconfirmed = true;
              } else {
                unconfirmed = true;
              }
            } catch {
              unconfirmed = true;
            }
          }
          if (name || unconfirmed) {
            setOauthNames((prev) => ({ ...prev, [key]: name ?? "saved" }));
            setOauthUnconfirmed((prev) => ({ ...prev, [key]: unconfirmed }));
          }
        } catch {
          // Table not set up yet — the OAuth cards still work.
        }
      };
      await loadOAuth(
        "tiktok_connections",
        ["username", "display_name"],
        "/api/auth/tiktok/profile",
        "tiktok"
      );
      await loadOAuth(
        "youtube_connections",
        ["channel_title", "channel_handle"],
        "/api/auth/youtube/profile",
        "youtube"
      );
      setLoading(false);
    }
    void load();
  }, []);

  // P1-C1: the Instagram paste card OR any OAuth account counts.
  // (Legacy tiktok_url / youtube_url pastes are dead data and
  // never count — only a real OAuth login on /connect does.)
  const connectedCount =
    (connected.instagram ? 1 : 0) +
    (oauthNames.tiktok ? 1 : 0) +
    (oauthNames.youtube ? 1 : 0);

  async function connectOne(key: PlatformKey) {
    setError("");
    const platform = PLATFORMS.find((p) => p.key === key)!;
    const url = urls[key].trim();
    if (!url) {
      const message = `Paste your ${platform.name} profile link first.`;
      setError(message);
      showError(message);
      return;
    }
    // Hostname check, not a substring match: "tiktok.com.evil.com"
    // or "evil.com/?x=instagram.com" used to pass as a profile
    // link because they CONTAIN the domain string.
    const host = hostnameOf(url);
    if (
      !host ||
      !(host === platform.domain || host.endsWith(`.${platform.domain}`))
    ) {
      const message = `That does not look like a ${platform.name} link — it should be a ${platform.domain} link.`;
      setError(message);
      showError(message);
      return;
    }
    const supabase = getBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured yet.");
      return;
    }
    setBusyKey(key);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Please log in first.");
      const field = FIELD[key];
      if (profileExists) {
        const { error: upError } = await supabase
          .from("users")
          .update({ [field]: url })
          .eq("id", data.user.id);
        if (upError) throw upError;
      } else {
        const { error: insError } = await supabase.from("users").insert({
          id: data.user.id,
          email: data.user.email,
          [field]: url,
        });
        if (insError) throw insError;
        setProfileExists(true);
      }
      setConnected((c) => ({ ...c, [key]: true }));
      // Instagram has no login yet (/connect: "Coming soon"), so its
      // toast must not promise a login verification that does not
      // exist — the link stays unverified until Instagram login
      // is ready.
      showSuccess(
        key === "instagram"
          ? "Instagram link added — not verified yet. Instagram login isn't ready yet, so this link stays unverified for now."
          : `${platform.name} link added — not verified yet. Verify for real with login on the My accounts page.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save link.";
      setError(message);
      showError(message);
    } finally {
      setBusyKey(null);
    }
  }

  const inputCls =
    "mt-3 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-sm text-fg outline-none placeholder:text-fg/30 focus:border-lime";

  if (loading) {
    return <p className="text-fg/60">Loading…</p>;
  }

  if (!loggedIn) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">
          Please log in first
        </h1>
        <p className="mt-2 text-sm text-fg/60">
          Onboarding starts right after you create your account.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-center text-xs font-black uppercase tracking-widest text-lime">
        Step 2 of 2 · Connect your profiles
      </p>
      <h1 className="mt-2 text-center font-display text-4xl font-black uppercase leading-none tracking-tight text-fg">
        Connect your profiles
      </h1>
      <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-fg/60">
        Add your Instagram profile link so your submitted Instagram
        clips can be matched to you. TikTok and YouTube are connected
        with login instead — see below.
      </p>
      <p className="mx-auto mt-3 max-w-md rounded-xl bg-amber-500/10 px-4 py-3 text-center text-sm font-semibold leading-relaxed text-amber-200">
        Pasting a link only saves it — it does not verify your
        account. TikTok and YouTube need a real login on the{" "}
        <Link href="/connect" className="font-bold text-lime underline">
          My accounts page
        </Link>
        .
      </p>
      <p className="mt-4 text-center text-sm font-bold text-fg">
        <span className="text-lime">
          {connectedCount < 1
            ? "No account connected yet"
            : `${connectedCount} account${connectedCount === 1 ? "" : "s"} connected`}
        </span>
      </p>

      <div className="mt-6 space-y-4">
        {PLATFORMS.map(({ key, name, placeholder, Icon }) => (
          <div
            key={key}
            className={`rounded-3xl border p-5 transition md:p-6 ${
              connected[key]
                ? "border-lime/60 bg-card"
                : "border-fg/10 bg-card"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fg/5 text-fg">
                <Icon className="h-6 w-6" />
              </span>
              <span>
                <span className="block font-display text-lg font-black tracking-tight text-fg">
                  Connect {name}
                </span>
                <span className="block text-xs text-fg/50">
                  {connected[key]
                    ? key === "instagram"
                      ? "Link added (not verified) — Instagram login isn't ready yet, so it stays unverified. You can update it anytime."
                      : "Link added (not verified) — you can update it anytime."
                    : "Paste your profile link to add it."}
                </span>
              </span>
              {connected[key] && (
                <span className="ml-auto shrink-0 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-black text-amber-200">
                  Link added (not verified)
                </span>
              )}
            </div>
            <input
              value={urls[key]}
              onChange={(e) =>
                setUrls((u) => ({ ...u, [key]: e.target.value }))
              }
              placeholder={placeholder}
              inputMode="url"
              className={inputCls}
              aria-label={`${name} profile link`}
            />
            <button
              type="button"
              onClick={() => void connectOne(key)}
              disabled={busyKey === key}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3 text-sm font-black text-black transition hover:bg-limedark disabled:opacity-40"
            >
              {busyKey === key ? (
                <>
                  <Spinner /> Loading...
                </>
              ) : connected[key] ? (
                `Update ${name} link`
              ) : (
                `Save ${name} link`
              )}
            </button>
          </div>
        ))}
        {OAUTH_PLATFORMS.map(({ key, name, Icon }) => {
          const oauthName = oauthNames[key];
          const unconfirmed = oauthUnconfirmed[key];
          return (
            <div
              key={key}
              className={`rounded-3xl border p-5 md:p-6 ${
                oauthName
                  ? "border-lime/60 bg-card"
                  : "border-fg/10 bg-card"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fg/5 text-fg">
                  <Icon className="h-6 w-6" />
                </span>
                <span>
                  <span className="block font-display text-lg font-black tracking-tight text-fg">
                    Connect {name}
                  </span>
                  <span className="block text-xs text-fg/50">
                    {oauthName
                      ? unconfirmed
                        ? `Saved${oauthName !== "saved" ? ` as ${key === "tiktok" ? "@" : ""}${oauthName}` : ""} — couldn't confirm the login, reconnect it on My accounts.`
                        : `Connected as ${key === "tiktok" ? "@" : ""}${oauthName}.`
                      : `Log in with ${name} to verify your account — pasting a link does not match your clips to you.`}
                  </span>
                </span>
                {oauthName && (
                  <span
                    className={`ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-black ${
                      unconfirmed
                        ? "bg-amber-400/20 text-amber-200"
                        : "bg-lime/15 text-lime"
                    }`}
                  >
                    {unconfirmed ? "Saved — reconnect" : "Connected"}
                  </span>
                )}
              </div>
              {oauthName ? (
                <Link
                  href="/connect"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-lime/50 py-3 text-sm font-black text-lime transition hover:bg-lime/10"
                >
                  Manage on My accounts →
                </Link>
              ) : (
                <Link
                  href="/connect"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3 text-sm font-black text-black transition hover:bg-limedark"
                >
                  Connect {name} with login →
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setLeaving(true);
          router.push("/campaigns");
        }}
        disabled={connectedCount < 1 || leaving}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3.5 text-base font-black text-black transition hover:bg-limedark disabled:opacity-40"
      >
        {leaving ? (
          <>
            <Spinner /> Loading campaigns…
          </>
        ) : (
          "Welcome! Now Browse Campaigns →"
        )}
      </button>
      <button
        type="button"
        onClick={() => {
          setLeaving(true);
          router.push("/campaigns");
        }}
        disabled={leaving}
        className="mt-3 flex w-full items-center justify-center gap-2 text-sm font-bold text-fg/60 transition hover:text-lime disabled:opacity-40"
      >
        {leaving ? (
          <>
            <Spinner /> Loading…
          </>
        ) : (
          "Skip for now"
        )}
      </button>
      {connectedCount < 1 && (
        <p className="mt-3 text-center text-xs text-fg/40">
          Add your Instagram link, or connect TikTok / YouTube with
          login, to continue — or skip and connect later.
        </p>
      )}
    </div>
  );
}
