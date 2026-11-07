"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";

/** Step 2 after signup: connect TikTok / Instagram / YouTube profile links. */
export default function ConnectPage() {
  const router = useRouter();
  const [tiktok, setTiktok] = useState("");
  const [instagram, setInstagram] = useState("");
  const [youtube, setYoutube] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
        setTiktok(p.tiktok_url ?? "");
        setInstagram(p.instagram_url ?? "");
        setYoutube(p.youtube_url ?? "");
      }
      setLoading(false);
    }
    void load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const supabase = getBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured yet.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Please log in first.");
      const { error: upError } = await supabase
        .from("users")
        .update({
          tiktok_url: tiktok.trim() || null,
          instagram_url: instagram.trim() || null,
          youtube_url: youtube.trim() || null,
        })
        .eq("id", data.user.id);
      if (upError) throw upError;
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save links.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-white/15 bg-ink px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-sun";

  if (loading) {
    return <p className="text-white/60">Loading…</p>;
  }

  if (!loggedIn) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-black text-white">Please log in first</h1>
        <p className="mt-2 text-sm text-white/60">
          Connect your social profiles after you log in.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-full bg-sun px-6 py-3 text-sm font-bold text-ink"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl font-black text-white">Connect your profiles</h1>
      <p className="mt-2 text-sm text-white/60">
        Step 2 — paste your TikTok, Instagram and YouTube profile links so
        your submitted clips can be matched to you.
      </p>
      <form
        onSubmit={save}
        className="mt-6 rounded-3xl border border-white/10 bg-card p-6"
      >
        <label className="block text-sm font-bold text-white">
          TikTok profile link
          <input
            value={tiktok}
            onChange={(e) => setTiktok(e.target.value)}
            placeholder="https://www.tiktok.com/@you"
            className={inputCls}
          />
        </label>
        <label className="mt-4 block text-sm font-bold text-white">
          Instagram profile link
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="https://www.instagram.com/you"
            className={inputCls}
          />
        </label>
        <label className="mt-4 block text-sm font-bold text-white">
          YouTube channel link
          <input
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
            placeholder="https://www.youtube.com/@you"
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
          className="mt-6 w-full rounded-full bg-sun py-3 text-sm font-bold text-ink transition hover:bg-sundark disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save & go to dashboard"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-3 w-full text-sm font-bold text-white/60 hover:text-sun"
        >
          Skip for now
        </button>
      </form>
    </div>
  );
}
