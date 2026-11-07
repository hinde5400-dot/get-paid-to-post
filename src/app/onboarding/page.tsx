"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import {
  TikTokIcon,
  InstagramIcon,
  YouTubeIcon,
} from "@/components/PlatformIcons";

/**
 * Onboarding — the step every new user lands on right after signup
 * (login is unchanged: existing users go to /dashboard).
 * Three big cards: Connect TikTok, Connect Instagram, Connect YouTube.
 * Each Connect button saves that profile URL to the user's profile
 * (users.tiktok_url / instagram_url / youtube_url — the same fields
 * the /connect page uses). At least 1 connection is required to
 * continue; Skip is also offered. Then: "Welcome! Now Browse
 * Campaigns" → Discover.
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
    key: "tiktok",
    name: "TikTok",
    domain: "tiktok.com",
    placeholder: "https://www.tiktok.com/@you",
    Icon: TikTokIcon,
  },
  {
    key: "instagram",
    name: "Instagram",
    domain: "instagram.com",
    placeholder: "https://www.instagram.com/you",
    Icon: InstagramIcon,
  },
  {
    key: "youtube",
    name: "YouTube",
    domain: "youtube.com",
    placeholder: "https://www.youtube.com/@you",
    Icon: YouTubeIcon,
  },
];

const FIELD: Record<PlatformKey, "tiktok_url" | "instagram_url" | "youtube_url"> = {
  tiktok: "tiktok_url",
  instagram: "instagram_url",
  youtube: "youtube_url",
};

export default function OnboardingPage() {
  const router = useRouter();
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
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<PlatformKey | null>(null);
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
      setLoading(false);
    }
    void load();
  }, []);

  const connectedCount = PLATFORMS.filter((p) => connected[p.key]).length;

  async function connectOne(key: PlatformKey) {
    setError("");
    const platform = PLATFORMS.find((p) => p.key === key)!;
    const url = urls[key].trim();
    if (!url) {
      setError(`Paste your ${platform.name} profile link first.`);
      return;
    }
    if (!url.toLowerCase().includes(platform.domain)) {
      setError(`That does not look like a ${platform.name} link — it should contain ${platform.domain}.`);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save link.");
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
        Connect at least 1 account so your submitted clips can be matched
        to you. You can add the others later from My accounts.
      </p>
      <p className="mt-4 text-center text-sm font-bold text-fg">
        <span className="text-lime">{connectedCount} of 3 connected</span>
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
                    ? "Connected — you can update the link anytime."
                    : "Paste your profile link to connect."}
                </span>
              </span>
              {connected[key] && (
                <span className="ml-auto shrink-0 rounded-full bg-lime px-3 py-1 text-xs font-black text-black">
                  ✓ Connected
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
              className="mt-3 w-full rounded-full bg-lime py-3 text-sm font-black text-black transition hover:bg-limedark disabled:opacity-40"
            >
              {busyKey === key
                ? "Connecting…"
                : connected[key]
                  ? `Update ${name} link`
                  : `Connect ${name}`}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => router.push("/campaigns")}
        disabled={connectedCount < 1}
        className="mt-6 w-full rounded-full bg-lime py-3.5 text-base font-black text-black transition hover:bg-limedark disabled:opacity-40"
      >
        Welcome! Now Browse Campaigns →
      </button>
      <button
        type="button"
        onClick={() => router.push("/campaigns")}
        className="mt-3 w-full text-sm font-bold text-fg/60 transition hover:text-lime"
      >
        Skip for now
      </button>
      {connectedCount < 1 && (
        <p className="mt-3 text-center text-xs text-fg/40">
          Connect at least 1 account to continue — or skip and connect later.
        </p>
      )}
    </div>
  );
}
