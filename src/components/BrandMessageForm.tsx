"use client";

import { useState } from "react";
import type { BrandMessage } from "@/lib/types";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/**
 * Private brand -> admin messages on the payment page. The brand can
 * ask the admin anything and send a proof link (a screenshot hosted
 * on Google Drive / Imgur) after paying the budget. Only the
 * campaign's brand owner and the admin ever see this thread.
 */
export default function BrandMessageForm({
  campaignId,
  initialMessages,
}: {
  campaignId: string;
  initialMessages: BrandMessage[];
}) {
  const { showError, showSuccess } = useToast();
  const [messages, setMessages] = useState<BrandMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const message = text.trim();
    if (message.length < 1 || message.length > 2000) {
      showError("Write a message first (up to 2000 characters).");
      return;
    }
    const proof = proofUrl.trim();
    if (proof) {
      try {
        const url = new URL(proof);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("bad protocol");
        }
      } catch {
        showError("Proof link must be a valid http(s) URL.");
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, proofUrl: proof || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send the message.");
      const saved = data.message as BrandMessage;
      setMessages((prev) => [...prev, saved]);
      setText("");
      setProofUrl("");
      showSuccess("Message sent to the admin.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not send the message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-bold text-fg">
        Your message
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask the admin anything — e.g. confirm you sent the budget, or share your payment screenshot link."
          rows={3}
          maxLength={2000}
          className="mt-1 w-full resize-y rounded-xl border border-fg/15 bg-ink px-4 py-3 text-sm leading-relaxed text-fg outline-none placeholder:text-fg/30 focus:border-lime"
        />
      </label>
      <label className="mt-3 block text-sm font-bold text-fg">
        Proof link (optional)
        <input
          type="url"
          value={proofUrl}
          onChange={(e) => setProofUrl(e.target.value)}
          placeholder="Screenshot URL — Google Drive / Imgur link"
          autoComplete="off"
          spellCheck={false}
          className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-sm text-fg outline-none placeholder:text-fg/30 focus:border-lime"
        />
        <span className="mt-1 block text-xs font-medium text-fg/50">
          Paste a link to your payment screenshot. No file upload — just
          the link.
        </span>
      </label>
      <button
        type="button"
        onClick={() => void send()}
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <Spinner /> Loading...
          </>
        ) : (
          "Send message"
        )}
      </button>

      {messages.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-xs font-black uppercase tracking-wider text-fg/50">
            Your messages
          </p>
          {messages.map((m) => (
            <div key={m.id} className="rounded-2xl bg-fg/5 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                {m.message}
              </p>
              {m.proof_url && (
                <a
                  href={m.proof_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block break-all text-sm font-bold text-lime underline"
                >
                  View proof ↗
                </a>
              )}
              <p className="mt-2 text-xs text-fg/40">
                {new Date(m.created_at).toLocaleString("en-US")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
