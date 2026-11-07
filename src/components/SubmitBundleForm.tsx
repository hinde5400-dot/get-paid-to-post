"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Campaign, Platform } from "@/lib/types";
import {
  COOLDOWN_MS,
  HOW_MADE_MIN_WORDS,
  MAX_PROOF_SCREENSHOTS,
  PLATFORM_LABELS,
} from "@/lib/constants";
import { countWords, validatePostUrl, VIDEO_RULES } from "@/lib/validate";
import { playChime } from "@/lib/sounds";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

export interface LastSubmission {
  platform: Platform;
  created_at: string;
}

function formatRemaining(ms: number): string {
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const CONFETTI_COLORS = ["#C6FF00", "#FFFFFF", "#7C5CFF", "#FF6B9D", "#3ED598"];

export default function SubmitBundleForm({
  campaign,
  lastByPlatform,
  isLoggedIn,
  userPostCount,
}: {
  campaign: Campaign;
  lastByPlatform: LastSubmission[];
  isLoggedIn: boolean;
  userPostCount: number;
}) {
  const [tiktok, setTiktok] = useState("");
  const [instagram, setInstagram] = useState("");
  const [youtube, setYoutube] = useState("");
  const [howMade, setHowMade] = useState("");
  const [proof, setProof] = useState<string[]>([""]);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { showError } = useToast();
  const [success, setSuccess] = useState<{
    codes: string[];
    message: string;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const words = countWords(howMade);
  const proofFilled = proof.map((p) => p.trim()).filter(Boolean);

  const cooldowns = useMemo(() => {
    const map = new Map<Platform, number>();
    for (const p of ["tiktok", "instagram", "youtube"] as Platform[]) {
      const last = lastByPlatform.find((l) => l.platform === p);
      if (!last) continue;
      const nextAllowed =
        new Date(last.created_at).getTime() + COOLDOWN_MS;
      if (nextAllowed > now) map.set(p, nextAllowed - now);
    }
    return map;
  }, [lastByPlatform, now]);

  const maxReached = userPostCount >= campaign.max_posts;

  function setProofAt(i: number, value: string) {
    setProof((prev) => prev.map((p, idx) => (idx === i ? value : p)));
  }

  async function submit() {
    if (!isLoggedIn) {
      showError("Please log in first to submit a post.");
      return;
    }
    if (maxReached) {
      showError(`You have already submitted the maximum of ${campaign.max_posts} posts for this campaign.`);
      return;
    }
    const links: { platform: Platform; url: string }[] = [];
    if (tiktok.trim()) links.push({ platform: "tiktok", url: tiktok.trim() });
    if (instagram.trim())
      links.push({ platform: "instagram", url: instagram.trim() });
    if (youtube.trim())
      links.push({ platform: "youtube", url: youtube.trim() });

    if (links.length < 2) {
      showError("Submit at least your TikTok and Instagram links together — they are reviewed and paid as one bundle.");
      return;
    }
    for (const l of links) {
      const check = validatePostUrl(l.url, l.platform);
      if (!check.ok) {
        showError(check.error ?? "Invalid link.");
        return;
      }
      if (cooldowns.has(l.platform)) {
        showError(
          `Please wait — you can submit another ${PLATFORM_LABELS[l.platform]} clip in ${formatRemaining(cooldowns.get(l.platform)!)}. One clip per platform every 2 hours.`
        );
        return;
      }
    }
    if (words < HOW_MADE_MIN_WORDS) {
      showError(
        `Tell us how you made this post — at least ${HOW_MADE_MIN_WORDS} words (you have ${words}).`
      );
      return;
    }
    if (proofFilled.length < 1) {
      showError("Please add at least one originality-proof screenshot link.");
      return;
    }
    if (!agreed) {
      showError("Please confirm you followed the campaign rules and this is your own content.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          tiktok: tiktok.trim() || null,
          instagram: instagram.trim() || null,
          youtube: youtube.trim() || null,
          howMade: howMade.trim(),
          proofScreenshots: proofFilled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed.");
      playChime();
      setSuccess({
        codes: (data.codes as string[]) ?? [],
        message: data.message ?? "Your post was submitted!",
      });
    } catch (e) {
      showError(e instanceof Error ? e.message : "Submission failed.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none placeholder:text-fg/30 focus:border-lime";

  return (
    <div className="rounded-3xl border border-fg/10 bg-card p-6">
      <h2 className="text-xl font-extrabold text-fg">Submit a post</h2>
      <p className="mt-1 text-sm text-fg/60">
        TikTok + Instagram together, YouTube optional — one bundle, reviewed
        and paid together. Max {campaign.max_posts} posts per campaign.
      </p>

      {cooldowns.size > 0 && (
        <div className="mt-4 space-y-2">
          {Array.from(cooldowns.entries()).map(([p, ms]) => (
            <p
              key={p}
              className="rounded-xl bg-lime/10 px-4 py-2.5 text-sm font-semibold text-lime"
            >
              ⏳ {PLATFORM_LABELS[p]}: next submit in {formatRemaining(ms)} —
              one clip per platform every 2 hours.
            </p>
          ))}
        </div>
      )}

      {maxReached && (
        <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
          You have reached the maximum of {campaign.max_posts} posts for this
          campaign.
        </p>
      )}

      <div className="mt-5 space-y-4">
        <label className="block text-sm font-bold text-fg">
          TikTok link *
          <input
            value={tiktok}
            onChange={(e) => setTiktok(e.target.value)}
            placeholder="https://www.tiktok.com/@you/video/..."
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-bold text-fg">
          Instagram link *
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="https://www.instagram.com/reel/..."
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-bold text-fg">
          YouTube link <span className="font-medium text-fg/50">(optional)</span>
          <input
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
            placeholder="https://www.youtube.com/shorts/..."
            className={inputCls}
          />
        </label>

        <label className="block text-sm font-bold text-fg">
          How you made this post{" "}
          <span className="font-medium text-fg/50">
            ({words}/{HOW_MADE_MIN_WORDS} words minimum)
          </span>
          <textarea
            value={howMade}
            onChange={(e) => setHowMade(e.target.value)}
            rows={3}
            placeholder="Describe how you filmed and edited this clip, what idea you used, and how you followed the brief…"
            className={`${inputCls} resize-none`}
          />
        </label>

        <div>
          <p className="text-sm font-bold text-fg">
            Originality proof — screenshot links{" "}
            <span className="font-medium text-fg/50">
              ({proofFilled.length}/{MAX_PROOF_SCREENSHOTS})
            </span>
          </p>
          <p className="mt-1 text-xs text-fg/50">
            Link to a screenshot of your live post or your editing project as
            proof this is your own content. At least one is required.
          </p>
          {proof.map((p, i) => (
            <input
              key={i}
              value={p}
              onChange={(e) => setProofAt(i, e.target.value)}
              placeholder={`Proof screenshot link ${i + 1}`}
              className={`${inputCls} mt-2`}
            />
          ))}
          {proof.length < MAX_PROOF_SCREENSHOTS && (
            <button
              type="button"
              onClick={() => setProof((prev) => [...prev, ""])}
              className="mt-2 text-sm font-bold text-lime hover:underline"
            >
              + Add another proof link
            </button>
          )}
        </div>

        <div className="rounded-2xl bg-fg/5 p-4">
          <p className="text-sm font-bold text-fg">Campaign rules</p>
          <ul className="mt-2 space-y-1 text-sm text-fg/70">
            {VIDEO_RULES.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </div>

        <label className="flex items-start gap-3 text-sm font-semibold text-fg">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-[#C6FF00]"
          />
          I followed the campaign rules and this is my own content.
        </label>

        {isLoggedIn ? (
          <button
            onClick={submit}
            disabled={busy || maxReached}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <>
                <Spinner /> Submitting…
              </>
            ) : (
              "Submit bundle"
            )}
          </button>
        ) : (
          <Link
            href="/login"
            className="block rounded-full bg-lime py-3.5 text-center text-sm font-bold text-ink transition hover:bg-limedark"
          >
            Log in to submit your post
          </Link>
        )}
      </div>

      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="animate-pop relative w-full max-w-md overflow-hidden rounded-3xl border border-lime/40 bg-card p-8 text-center shadow-2xl">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {Array.from({ length: 24 }).map((_, i) => (
                <span
                  key={i}
                  className="animate-confetti absolute top-0 block h-2.5 w-2.5 rounded-sm"
                  style={{
                    left: `${(i * 41) % 100}%`,
                    backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                    animationDelay: `${(i % 8) * 0.12}s`,
                    animationDuration: `${1.8 + (i % 5) * 0.3}s`,
                  }}
                />
              ))}
            </div>
            <p className="text-5xl">🎉</p>
            <h3 className="mt-3 text-2xl font-black text-fg">
              Post submitted!
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-fg/70">
              {success.message} Your bundle is Under Review and shows $0 until
              it is approved — approved earnings then move into your 72-hour
              hold.
            </p>
            {success.codes.length > 0 && (
              <div className="mt-4 rounded-xl bg-fg/5 p-3 text-left text-xs text-fg/70">
                <p className="font-bold text-fg">Submission IDs</p>
                {success.codes.map((code) => (
                  <p key={code} className="mt-1 font-mono">
                    {code}
                  </p>
                ))}
              </div>
            )}
            <div className="mt-5 flex gap-3">
              <Link
                href="/my-posts"
                className="flex-1 rounded-full bg-lime py-3 text-sm font-bold text-ink"
              >
                View My Posts
              </Link>
              <button
                onClick={() => setSuccess(null)}
                className="flex-1 rounded-full border border-fg/20 py-3 text-sm font-bold text-fg"
              >
                Keep browsing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
