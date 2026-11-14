"use client";

import { useEffect, useRef, useState } from "react";
import {
  InstagramIcon,
  TikTokIcon,
  YouTubeIcon,
} from "@/components/PlatformIcons";

/**
 * Connect card — one per platform (TikTok / Instagram / YouTube).
 * Professional bio-code flow, no login anywhere:
 *
 * 1. The card shows the platform's official logo + "Connect
 *    TikTok". Click it and it opens in place.
 * 2. The creator pastes a profile link and clicks "Get code for
 *    bio". The site gives a unique code (GPTP-XXXXXX) with a Copy
 *    button and one instruction: copy it into the profile bio,
 *    wait 2 minutes, then click Verify.
 * 3. Verify stays disabled until the 2-minute timer ends. The
 *    server then fetches the PUBLIC profile bio (3 server-side
 *    retries) and checks the code is really there. A code found
 *    means CONNECTED, with a green tick. A bio the server cannot
 *    read says so plainly — try again in 2 minutes, or contact
 *    Support. No screenshot, no admin approval, ever.
 * 4. A connected profile is LOCKED to the account: the creator
 *    cannot connect a different profile on this platform until
 *    they Disconnect the first one (the Disconnect button frees
 *    the slot immediately).
 */

export type BioProfileStatus = {
  platform: string;
  profile_url: string;
  handle: string;
  verified_at: string | null;
  verified_by: string | null;
  bio_code: string | null;
  code_expires_at: string | null;
  issued_at: string;
};

type Props = {
  platform: "tiktok" | "instagram" | "youtube";
  title: string;
  placeholder: string;
  bioHint: string;
  savedUrl: string | null;
  initial: BioProfileStatus | null;
};

const WAIT_SECONDS = 120;

type ApiBody = {
  code?: string;
  expires_at?: string;
  handle?: string;
  verified?: boolean;
  verified_at?: string;
  message?: string;
  error?: string;
  retryable?: boolean;
  pending?: boolean;
  run_id?: string;
  already_verified?: boolean;
  reused?: boolean;
  issued_at?: string;
  wait_seconds?: number;
};

async function postJson(
  url: string,
  body: Record<string, string>
): Promise<{ ok: boolean; data: ApiBody }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as ApiBody;
  return { ok: res.ok, data };
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const PLATFORM_ICONS = {
  tiktok: TikTokIcon,
  instagram: InstagramIcon,
  youtube: YouTubeIcon,
} as const;

/** Official brand colour for the logo (TikTok adapts to the theme). */
const PLATFORM_ICON_COLOR: Record<Props["platform"], string> = {
  tiktok: "text-fg",
  instagram: "text-[#FF0069]",
  youtube: "text-[#FF0000]",
};

export default function BioVerifyCard({
  platform,
  title,
  placeholder,
  bioHint,
  savedUrl,
  initial,
}: Props) {
  const [link, setLink] = useState(initial?.profile_url ?? savedUrl ?? "");
  const [code, setCode] = useState<string | null>(initial?.bio_code ?? null);
  const [expiresAt, setExpiresAt] = useState<string | null>(
    initial?.code_expires_at ?? null
  );
  const [issuedAt, setIssuedAt] = useState<string | null>(
    initial?.issued_at ?? null
  );
  const [handle, setHandle] = useState<string | null>(
    initial?.handle ?? null
  );
  const [verifiedAt, setVerifiedAt] = useState<string | null>(
    initial?.verified_at ?? null
  );
  // Collapsed by default; open when a code is already waiting, so
  // the creator sees it straight away.
  const [expanded, setExpanded] = useState(
    Boolean(initial && !initial.verified_at && initial.bio_code)
  );
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "err" | "info">(
    "info"
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards the 30-second auto-retry waits: if the creator leaves
  // the page mid-retry, no state is set on the unmounted card.
  const aliveRef = useRef(true);
  useEffect(() => {
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const waitRemaining = issuedAt
    ? Math.max(
        0,
        WAIT_SECONDS - Math.floor((now - new Date(issuedAt).getTime()) / 1000)
      )
    : 0;
  const codeExpired =
    !!expiresAt && new Date(expiresAt).getTime() <= now;

  // 1-second ticker while a code is pending (drives the 2-minute
  // Verify countdown and the expiry display).
  useEffect(() => {
    if (!code || verifiedAt || codeExpired) return;
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [code, verifiedAt, codeExpired]);

  function say(kind: "ok" | "err" | "info", text: string) {
    setMessageKind(kind);
    setMessage(text);
  }

  async function getCode() {
    if (!link.trim()) {
      say("err", "Paste your profile link first.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { ok, data } = await postJson("/api/profile/verify", {
      platform,
      profile_url: link.trim(),
    });
    setBusy(false);
    if (!ok) {
      say("err", data.error ?? "Could not issue a code — please try again.");
      return;
    }
    if (data.already_verified) {
      setVerifiedAt(data.verified_at ?? new Date().toISOString());
      setHandle(data.handle ?? handle);
      setCode(null);
      say("ok", "This profile is already connected.");
      return;
    }
    setCode(data.code ?? null);
    setExpiresAt(data.expires_at ?? null);
    setIssuedAt(data.issued_at ?? new Date().toISOString());
    setHandle(data.handle ?? null);
    setNow(Date.now());
    say(
      "info",
      "Code issued — add it to your bio, wait 2 minutes, then click Verify."
    );
  }

  async function verify() {
    // Instagram has its own flow (Apify run + polling) — see below.
    if (platform === "instagram") return verifyInstagram();
    setBusy(true);
    setMessage("");
    const { ok, data } = await postJson("/api/profile/verify/check", {
      platform,
    });
    setBusy(false);
    if (ok && data.verified) {
      setVerifiedAt(data.verified_at ?? new Date().toISOString());
      setHandle(data.handle ?? handle);
      setCode(null);
      say("ok", "Connected — this profile is now locked to your account.");
      return;
    }
    say("err", data.error ?? "Could not verify — please try again.");
  }

  // Instagram only (Turn's order): the bio is read by Apify, and
  // an Apify run takes 30–90 seconds — so one Verify click starts
  // the run and the card polls every 10 seconds until it finishes
  // (up to ~3 minutes). If the run fails, it retries after 30
  // seconds, up to 3 tries in total, before the error is shown.
  // TikTok / YouTube are untouched: one shot, as before.
  async function verifyInstagram() {
    setBusy(true);
    setMessage("");
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        say(
          "info",
          `Instagram is taking a moment — retrying… (attempt ${attempt} of 3)`
        );
        await new Promise((resolve) => setTimeout(resolve, 30000));
        if (!aliveRef.current) return;
      }
      let runId: string | undefined;
      for (let poll = 0; poll < 18; poll++) {
        if (poll > 0) {
          say("info", "Checking your Instagram bio…");
          await new Promise((resolve) => setTimeout(resolve, 10000));
          if (!aliveRef.current) return;
        }
        const { ok, data } = await postJson(
          "/api/profile/verify/check",
          runId ? { platform, run_id: runId } : { platform }
        );
        if (!aliveRef.current) return;
        if (ok && data.verified) {
          setVerifiedAt(data.verified_at ?? new Date().toISOString());
          setHandle(data.handle ?? handle);
          setCode(null);
          setBusy(false);
          say("ok", "Connected — this profile is now locked to your account.");
          return;
        }
        if (data.pending) {
          runId = data.run_id;
          continue;
        }
        if (data.retryable) break;
        setBusy(false);
        say("err", data.error ?? "Could not verify — please try again.");
        return;
      }
      // Polls ran out with the run still going — treat it as a
      // retryable failure; the next attempt resumes the same run.
    }
    setBusy(false);
    say("err", "Instagram is taking a moment — try Verify again in 2 minutes.");
  }

  async function disconnect() {
    if (
      !window.confirm(
        `Disconnect your ${title} profile? You can connect a different profile after that.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/profile/verify?platform=${platform}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not disconnect.");
      }
      setVerifiedAt(null);
      setHandle(null);
      setCode(null);
      setExpiresAt(null);
      setIssuedAt(null);
      setLink("");
      setExpanded(true);
      say("ok", "Disconnected — you can connect a different profile now.");
    } catch (err) {
      say(
        "err",
        err instanceof Error ? err.message : "Could not disconnect."
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      say("info", "Copy didn't work — select the code and copy it by hand.");
    }
  }

  const Icon = PLATFORM_ICONS[platform];
  const bioPlace = platform === "youtube" ? "channel description" : `${title} bio`;

  return (
    <div className="mt-4 rounded-3xl border border-fg/10 bg-card p-6">
      {/* Card header — logo + Connect + status. Tapping opens the
          flow in place. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 text-left"
      >
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fg/5 ${PLATFORM_ICON_COLOR[platform]}`}
        >
          <Icon className="h-7 w-7" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-black text-fg">
            Connect {title}
          </span>
          <span className="mt-0.5 block truncate text-sm text-fg/60">
            {verifiedAt
              ? `Connected as @${handle ?? ""}`
              : code && !codeExpired
                ? "Your code is ready — add it to your bio"
                : "Connect with a bio code — no login needed"}
          </span>
        </span>
        {verifiedAt ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-lime/15 px-3 py-1.5 text-xs font-black text-limeink">
            <span aria-hidden>✓</span> Connected
          </span>
        ) : (
          <span
            aria-hidden
            className="shrink-0 text-lg font-black text-fg/40"
          >
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-5 border-t border-fg/10 pt-5">
          {verifiedAt ? (
            <>
              <p className="flex items-start gap-3 rounded-xl bg-lime/10 px-4 py-3 text-sm font-semibold leading-relaxed text-limeink">
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lime text-sm font-black text-black"
                >
                  ✓
                </span>
                <span>
                  Connected as @{handle}. This profile is locked to
                  your account — only videos from it can be
                  submitted. To connect a different profile,
                  disconnect this one first.
                </span>
              </p>
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className="mt-4 inline-block rounded-full border border-red-500/50 px-6 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
              >
                {busy ? "Disconnecting..." : `Disconnect ${title}`}
              </button>
            </>
          ) : (
            <>
              <label className="block text-sm font-bold text-fg">
                Paste your {title} profile link
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder={placeholder}
                  className="mt-2 w-full rounded-xl border border-fg/15 bg-ink px-4 py-2.5 text-sm text-fg placeholder:text-fg/40 focus:border-lime focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={getCode}
                disabled={busy || !link.trim()}
                className="mt-3 inline-block rounded-full bg-lime px-6 py-3 text-sm font-bold text-ink transition hover:bg-limedark disabled:opacity-40"
              >
                {busy
                  ? "Working..."
                  : code && !codeExpired
                    ? "Get a new code"
                    : "Get code for bio"}
              </button>

              {code && !codeExpired && (
                <div className="mt-4 rounded-xl border border-lime/30 bg-lime/5 px-4 py-3">
                  <p className="text-sm leading-relaxed text-fg/80">
                    Copy this code, put it in your {bioPlace}, wait
                    2 minutes, then click Verify.
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <code className="font-mono text-xl font-black tracking-wider text-fg">
                      {code}
                    </code>
                    <button
                      type="button"
                      onClick={copyCode}
                      className="rounded-full border border-fg/20 px-3 py-1 text-xs font-bold text-fg transition hover:bg-fg/10"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-fg/60">{bioHint}</p>
                  <button
                    type="button"
                    onClick={verify}
                    disabled={busy || waitRemaining > 0}
                    className="mt-3 inline-block rounded-full bg-lime px-6 py-3 text-sm font-bold text-ink transition hover:bg-limedark disabled:opacity-40"
                  >
                    {busy
                      ? "Checking..."
                      : waitRemaining > 0
                        ? `Verify in ${formatCountdown(waitRemaining)}`
                        : "Verify"}
                  </button>
                  {waitRemaining > 0 && (
                    <p className="mt-2 text-xs text-fg/50">
                      Wait for the timer — the bio needs a couple of
                      minutes to update everywhere.
                    </p>
                  )}
                </div>
              )}

              {code && codeExpired && (
                <p className="mt-3 rounded-xl bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-200">
                  Your code expired — get a new code and try again.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {message && (
        <p
          className={`mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold ${
            messageKind === "ok"
              ? "bg-lime/15 text-limeink"
              : messageKind === "err"
                ? "bg-red-500/15 text-red-300"
                : "bg-fg/5 text-fg/70"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
