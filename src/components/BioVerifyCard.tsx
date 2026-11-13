"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Bio-code verification card — one per platform (TikTok /
 * Instagram / YouTube). The creator pastes a profile link, gets a
 * unique code (GPTP-XXXXXX), writes it in their profile bio, waits
 * 2 minutes, then clicks Verify. The server fetches the PUBLIC
 * profile bio and checks the code is really there — no login, no
 * API approval. When the server cannot read the bio automatically
 * (TikTok / Instagram pages usually do not carry one for a server
 * fetch), the creator uploads a bio screenshot and the admin
 * verifies it by hand.
 */

export type BioProfileStatus = {
  platform: string;
  profile_url: string;
  handle: string;
  verified_at: string | null;
  verified_by: string | null;
  proof_url: string | null;
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
  status?: string;
  message?: string;
  error?: string;
  auto_read_failed?: boolean;
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
  const [proofUrl, setProofUrl] = useState("");
  const [manualReview, setManualReview] = useState(
    Boolean(initial && !initial.verified_at && initial.proof_url)
  );
  const [showProofForm, setShowProofForm] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "err" | "info">(
    "info"
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      say("ok", "This profile is already verified.");
      return;
    }
    setCode(data.code ?? null);
    setExpiresAt(data.expires_at ?? null);
    setIssuedAt(data.issued_at ?? new Date().toISOString());
    setHandle(data.handle ?? null);
    setManualReview(false);
    setShowProofForm(false);
    setNow(Date.now());
    say(
      "info",
      "Code issued — add it to your bio, wait 2 minutes, then click Verify."
    );
  }

  async function verify() {
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
      say("ok", "Verified — this profile is now locked to your account.");
      return;
    }
    if (data.status === "manual_review") {
      setManualReview(true);
      say("info", data.message ?? "Your screenshot is waiting for the admin.");
      return;
    }
    if (data.auto_read_failed) {
      setShowProofForm(true);
      say(
        "info",
        data.message ??
          "We couldn't read your bio automatically — upload a screenshot of your bio showing the code instead."
      );
      return;
    }
    say("err", data.error ?? "Could not verify — please try again.");
  }

  async function submitProof() {
    if (!proofUrl.trim()) {
      say("err", "Paste a screenshot link first.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { ok, data } = await postJson("/api/profile/verify/proof", {
      platform,
      proof_url: proofUrl.trim(),
    });
    setBusy(false);
    if (!ok) {
      say("err", data.error ?? "Could not save the screenshot — please try again.");
      return;
    }
    setManualReview(true);
    setShowProofForm(false);
    say(
      "ok",
      data.message ?? "Screenshot saved — the admin will check your bio."
    );
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

  const cardCls = "rounded-3xl border border-fg/10 bg-card p-6";

  return (
    <div className={`mt-4 ${cardCls}`}>
      <h2 className="text-sm font-bold text-fg">Verify {title}</h2>

      {verifiedAt ? (
        <p className="mt-2 rounded-xl bg-lime/15 px-4 py-2.5 text-sm font-semibold text-lime">
          Verified as @{handle}. This profile is locked to your
          account — only videos from it can be submitted. To change
          it, ask the admin to unlock it.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-fg/60">
            Paste your {title} profile link. We will give you a code
            to put in your bio — that proves the profile is yours.
          </p>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={placeholder}
            className="mt-3 w-full rounded-xl border border-fg/15 bg-bg px-4 py-2.5 text-sm text-fg placeholder:text-fg/40 focus:border-lime focus:outline-none"
          />
          <button
            type="button"
            onClick={getCode}
            disabled={busy || !link.trim()}
            className="mt-3 inline-block rounded-full bg-lime px-6 py-3 text-sm font-bold text-ink transition hover:bg-limedark disabled:opacity-40"
          >
            {busy ? "Working..." : code && !codeExpired ? "Get a new code" : "Get my code"}
          </button>

          {code && !codeExpired && (
            <div className="mt-4 rounded-xl border border-lime/30 bg-lime/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg/60">
                Your code — add it to your {title} bio
              </p>
              <div className="mt-2 flex items-center gap-3">
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
                    : "Verify my bio"}
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

          {showProofForm && !manualReview && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <p className="text-sm font-semibold text-fg">
                We couldn&apos;t read your bio automatically
              </p>
              <p className="mt-1 text-sm text-fg/60">
                Take a screenshot of your profile showing the code in
                your bio, upload it somewhere (Imgur, Lightshot,
                postimages), and paste the link here. The admin will
                check it and verify your profile.
              </p>
              <input
                type="url"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                placeholder="https://i.imgur.com/… or https://prnt.sc/…"
                className="mt-3 w-full rounded-xl border border-fg/15 bg-bg px-4 py-2.5 text-sm text-fg placeholder:text-fg/40 focus:border-lime focus:outline-none"
              />
              <button
                type="button"
                onClick={submitProof}
                disabled={busy || !proofUrl.trim()}
                className="mt-3 inline-block rounded-full bg-lime px-6 py-3 text-sm font-bold text-ink transition hover:bg-limedark disabled:opacity-40"
              >
                {busy ? "Saving..." : "Send screenshot for review"}
              </button>
            </div>
          )}

          {manualReview && (
            <p className="mt-3 rounded-xl bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-200">
              Your screenshot is waiting for the admin to check. You
              will see the result here once it is reviewed.
            </p>
          )}
        </>
      )}

      {message && (
        <p
          className={`mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold ${
            messageKind === "ok"
              ? "bg-lime/15 text-lime"
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
