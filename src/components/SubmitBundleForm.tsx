"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Campaign, Platform } from "@/lib/types";
import { campaignPlatforms, platformNamesText } from "@/lib/types";
import {
  COOLDOWN_MS,
  HOW_MADE_MIN_WORDS,
  MAX_APPROVED_CLIPS_PER_PLATFORM,
  MAX_PROOF_SCREENSHOTS,
  PLATFORM_LABELS,
} from "@/lib/constants";
import { countWords, validatePostUrl, validateProofUrl, VIDEO_RULES } from "@/lib/validate";
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

const PLATFORM_INPUTS: { key: Platform; placeholder: string }[] = [
  { key: "tiktok", placeholder: "https://www.tiktok.com/@you/video/..." },
  { key: "instagram", placeholder: "https://www.instagram.com/reel/..." },
  { key: "youtube", placeholder: "https://www.youtube.com/shorts/..." },
];

export default function SubmitBundleForm({
  campaign,
  lastByPlatform,
  isLoggedIn,
  approvedByPlatform,
  tiktokConnected,
  youtubeConnected,
}: {
  campaign: Campaign;
  lastByPlatform: LastSubmission[];
  isLoggedIn: boolean;
  /** Approved clips per platform for this creator on this campaign
   *  (P0 batch 2) — only approved counts, rejected clips don't. */
  approvedByPlatform: Partial<Record<Platform, number>>;
  /** OAuth connection state (loaded by the submit pages).
   *  undefined = unknown — the hint shows, never the reverse.
   *  Warn only: the API enforces the connection, never the form. */
  tiktokConnected?: boolean;
  youtubeConnected?: boolean;
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
    /** One link in the bundle was a duplicate and was rejected,
     *  while the other clip(s) were submitted fine. */
    duplicateWarning?: boolean;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const words = countWords(howMade);
  const proofFilled = proof.map((p) => p.trim()).filter(Boolean);
  // Platforms this campaign accepts (migration 0012). Only these
  // inputs are shown, and a link on any other platform is rejected.
  // Bundle rule: at least 2 links when the campaign runs on 2+ platforms,
  // 1 link when it runs on a single platform.
  const allowedPlatforms = campaignPlatforms(campaign);
  const minLinks = Math.min(2, allowedPlatforms.length);
  const platformNames = platformNamesText(allowedPlatforms);

  const cooldowns = useMemo(() => {
    const map = new Map<Platform, number>();
    for (const p of allowedPlatforms) {
      const last = lastByPlatform.find((l) => l.platform === p);
      if (!last) continue;
      const nextAllowed =
        new Date(last.created_at).getTime() + COOLDOWN_MS;
      if (nextAllowed > now) map.set(p, nextAllowed - now);
    }
    return map;
  }, [lastByPlatform, now, allowedPlatforms]);

  // Clip limit (P0 batch 2): 15 APPROVED clips per platform.
  // The form is only fully blocked when EVERY platform this
  // campaign accepts is already at 15 approved; a single platform
  // at the limit is checked per link at submit time below.
  const approvedFor = (p: Platform) => approvedByPlatform[p] ?? 0;
  const maxReached = allowedPlatforms.every(
    (p) => approvedFor(p) >= MAX_APPROVED_CLIPS_PER_PLATFORM
  );

  function setProofAt(i: number, value: string) {
    setProof((prev) => prev.map((p, idx) => (idx === i ? value : p)));
  }

  async function submit() {
    if (!isLoggedIn) {
      showError("Please log in first to submit a post.");
      return;
    }
    if (maxReached) {
      showError(
        `You already have ${MAX_APPROVED_CLIPS_PER_PLATFORM} approved clips on every platform for this campaign — the limit is 15 approved clips per platform.`
      );
      return;
    }
    const linkValues: Record<Platform, string> = {
      tiktok,
      instagram,
      youtube,
    };
    const links: { platform: Platform; url: string }[] = [];
    for (const p of allowedPlatforms) {
      const url = linkValues[p].trim();
      if (url) links.push({ platform: p, url });
    }

    if (links.length < minLinks) {
      showError(
        minLinks === 1
          ? `Submit your ${platformNames} link.`
          : `Submit at least ${minLinks} links on the campaign's platforms (${platformNames}) together — each clip is then reviewed and paid on its own.`
      );
      return;
    }
    for (const l of links) {
      if (!allowedPlatforms.includes(l.platform)) {
        showError(
          `This campaign only accepts clips on ${platformNames}.`
        );
        return;
      }
      if (approvedFor(l.platform) >= MAX_APPROVED_CLIPS_PER_PLATFORM) {
        showError(
          `You already have ${MAX_APPROVED_CLIPS_PER_PLATFORM} approved ${PLATFORM_LABELS[l.platform]} clips for this campaign — the limit is 15 approved clips per platform.`
        );
        return;
      }
      const check = validatePostUrl(l.url, l.platform);
      if (!check.ok) {
        showError(check.error ?? "Invalid link.");
        return;
      }
      if (cooldowns.has(l.platform)) {
        showError(
          `Please wait — you can submit another ${PLATFORM_LABELS[l.platform]} clip in ${formatRemaining(cooldowns.get(l.platform)!)}. One clip per platform every 2 hours, across all campaigns on that platform.`
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
    for (const p of proofFilled) {
      const proofCheck = validateProofUrl(
        p,
        links.map((l) => l.url)
      );
      if (!proofCheck.ok) {
        showError(proofCheck.error ?? "Proof must be a real link.");
        return;
      }
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
      // A mixed bundle (one clean clip + one duplicate) is a
      // PARTIAL success: the clean clip(s) are live under review
      // with their codes, and the duplicate was rejected. Show
      // BOTH — the success popup for the clean clip(s) AND the
      // duplicate warning — never only an error, or the creator
      // concludes the whole bundle failed and resubmits the good
      // link into a confusing "already been submitted" error.
      playChime();
      setSuccess({
        codes: (data.codes as string[]) ?? [],
        message: data.message ?? "Your post was submitted!",
        duplicateWarning: Boolean(data.duplicateWarning),
      });
      // Clear the link/proof inputs so a resubmit after this
      // success cannot produce a confusing "already been
      // submitted" error.
      setTiktok("");
      setInstagram("");
      setYoutube("");
      setProof([""]);
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
        {allowedPlatforms.length === 1
          ? `Post on ${platformNames} and submit your link below — one post, reviewed and paid.`
          : allowedPlatforms.length === 2
            ? `Post on ${platformNames} together — submit both links as one bundle; each clip is then reviewed and paid on its own.`
            : `Post on any 2 of ${platformNames} — submit the links as one bundle; each clip is then reviewed and paid on its own.`}{" "}
        Up to 15 approved clips per platform — rejected clips
        don&apos;t count toward the limit, and a rejected clip cannot
        be resubmitted — post a new clip instead.
      </p>
      {campaign.brief_url && (
        <p className="mt-3 rounded-xl bg-fg/5 px-4 py-2.5 text-sm font-semibold text-fg/80">
          Campaign brief:{" "}
          <a
            href={campaign.brief_url}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-lime hover:underline"
          >
            Open the brief (Google Drive) ↗
          </a>
        </p>
      )}
      <p className="mt-3 rounded-xl bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-200">
        ⏱ Submit your link within 30 minutes of posting — a link
        posted more than 30 minutes ago is not accepted. Instagram
        links are hand-checked by the admin (no automatic check yet).
      </p>
      {isLoggedIn && (
        <p className="mt-1 text-sm text-fg/60">
          Your approved clips:{" "}
          {allowedPlatforms
            .map(
              (p) =>
                `${PLATFORM_LABELS[p]} ${approvedFor(p)}/${MAX_APPROVED_CLIPS_PER_PLATFORM}`
            )
            .join(" · ")}
          {" — "}rejected clips don&apos;t count toward the limit.
        </p>
      )}

      {cooldowns.size > 0 && (
        <div className="mt-4 space-y-2">
          {Array.from(cooldowns.entries()).map(([p, ms]) => (
            <p
              key={p}
              className="rounded-xl bg-lime/10 px-4 py-2.5 text-sm font-semibold text-lime"
            >
              ⏳ {PLATFORM_LABELS[p]}: next submit in {formatRemaining(ms)} —
              one clip per platform every 2 hours, across all campaigns
              on this platform.
            </p>
          ))}
        </div>
      )}

      {maxReached && (
        <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
          You have reached the limit of {MAX_APPROVED_CLIPS_PER_PLATFORM}{" "}
          approved clips on every platform for this campaign.
        </p>
      )}

      <div className="mt-5 space-y-4">
        {allowedPlatforms.map((p) => {
          const input = PLATFORM_INPUTS.find((i) => i.key === p)!;
          const linkState: Record<
            Platform,
            [string, (v: string) => void]
          > = {
            tiktok: [tiktok, setTiktok],
            instagram: [instagram, setInstagram],
            youtube: [youtube, setYoutube],
          };
          const [value, setValue] = linkState[p];
          return (
            <label key={p} className="block text-sm font-bold text-fg">
              {PLATFORM_LABELS[p]} link{" "}
              {allowedPlatforms.length <= 2 ? (
                "*"
              ) : (
                <span className="font-medium text-fg/50">(pick any 2)</span>
              )}
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={input.placeholder}
                className={inputCls}
              />
              {p === "tiktok" && tiktokConnected !== true && (
                <span className="mt-1 block font-medium text-fg/50">
                  Only videos from your connected TikTok account count —{" "}
                  <Link href="/connect" className="font-bold text-lime hover:underline">
                    connect your account
                  </Link>{" "}
                  first.
                </span>
              )}
              {p === "instagram" && (
                <span className="mt-1 block font-medium text-fg/50">
                  Instagram links are hand-checked by the admin — post
                  time and ownership can&apos;t be checked automatically
                  yet. Submit only Reels from the Instagram profile you
                  linked in onboarding.
                </span>
              )}
              {p === "youtube" && youtubeConnected !== true && (
                <span className="mt-1 block font-medium text-fg/50">
                  Only videos from your connected YouTube channel count —{" "}
                  <Link href="/connect" className="font-bold text-lime hover:underline">
                    connect your channel
                  </Link>{" "}
                  first.
                </span>
              )}
            </label>
          );
        })}

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
            proof this is your own content. At least one is required — a
            direct image link (.png, .jpg, .webp, .gif) or a screenshot
            link from Imgur, Lightshot (prnt.sc), ibb.co or postimages.
            Google Drive links are not images.
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
                <Spinner /> Loading...
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
            {success.duplicateWarning && (
              <p className="mt-3 rounded-xl bg-amber-500/10 px-4 py-2.5 text-left text-sm font-semibold leading-relaxed text-amber-200">
                ⚠️ One link in this bundle was a duplicate and was
                rejected — the clip(s) below are the ones that were
                submitted and are now under review.
              </p>
            )}
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
