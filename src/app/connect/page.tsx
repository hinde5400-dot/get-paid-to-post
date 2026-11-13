"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import BioVerifyCard, {
  type BioProfileStatus,
} from "@/components/BioVerifyCard";

/**
 * Connect your profiles — bio-code only, no login anywhere.
 * Three cards (TikTok, Instagram, YouTube): tap one, paste your
 * profile link, get a code for your bio, wait 2 minutes, click
 * Verify. The server reads your PUBLIC bio and checks the code
 * is really there — that proves the profile is yours. A
 * connected profile is locked to your account until you
 * disconnect it. Only videos from your own connected profiles
 * can be submitted.
 */
export default function ConnectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [bioProfiles, setBioProfiles] = useState<BioProfileStatus[] | null>(
    null
  );
  const [savedLinks, setSavedLinks] = useState<{
    tiktok: string | null;
    instagram: string | null;
    youtube: string | null;
  }>({ tiktok: null, instagram: null, youtube: null });

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
      // Bio-code verification status (migration 0046) + the
      // profile links saved in onboarding, to pre-fill the cards.
      // A missing table is ignored here instead of breaking the page.
      try {
        const res = await fetch("/api/profile/verify");
        if (res.ok) {
          const body = (await res.json()) as {
            profiles?: BioProfileStatus[];
          };
          setBioProfiles(body.profiles ?? []);
        }
      } catch {
        // Verification table not set up yet — the cards still work.
      }
      try {
        const { data: me } = await supabase
          .from("users")
          .select("tiktok_url, instagram_url, youtube_url")
          .eq("id", data.user.id)
          .maybeSingle();
        const m = me as {
          tiktok_url?: string | null;
          instagram_url?: string | null;
          youtube_url?: string | null;
        } | null;
        if (m) {
          setSavedLinks({
            tiktok: m.tiktok_url ?? null,
            instagram: m.instagram_url ?? null,
            youtube: m.youtube_url ?? null,
          });
        }
      } catch {
        // Profile links not saved yet — the cards still work.
      }
      setLoading(false);
    }
    void load();
  }, []);

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

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Connect your profiles</h1>
      <p className="mt-2 text-sm text-fg/60">
        Tap a platform, paste your profile link, and put the code we
        give you in your bio — that proves the profile is yours. No
        login, no password, no app to approve. Once connected, a
        profile is locked to your account, and only videos from your
        own connected profiles can earn.
      </p>

      <BioVerifyCard
        platform="tiktok"
        title="TikTok"
        placeholder="https://www.tiktok.com/@yourhandle"
        bioHint="Add the code anywhere in your TikTok bio, save it, then wait for the timer and click Verify."
        savedUrl={savedLinks.tiktok}
        initial={bioProfiles?.find((p) => p.platform === "tiktok") ?? null}
      />
      <BioVerifyCard
        platform="instagram"
        title="Instagram"
        placeholder="https://www.instagram.com/yourhandle"
        bioHint="Add the code anywhere in your Instagram bio, save it, then wait for the timer and click Verify."
        savedUrl={savedLinks.instagram}
        initial={
          bioProfiles?.find((p) => p.platform === "instagram") ?? null
        }
      />
      <BioVerifyCard
        platform="youtube"
        title="YouTube"
        placeholder="https://www.youtube.com/@yourhandle"
        bioHint="Add the code anywhere in your channel description (Customise channel → Basic info → Description), save it, then wait for the timer and click Verify."
        savedUrl={savedLinks.youtube}
        initial={bioProfiles?.find((p) => p.platform === "youtube") ?? null}
      />

      <p className="mt-6 text-center text-sm text-fg/60">
        Stuck? Tap the yellow <span className="font-bold text-fg">?</span>{" "}
        button at the bottom right — our support team is on Discord.
      </p>
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
