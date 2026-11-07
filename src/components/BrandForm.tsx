"use client";

import { useState } from "react";
import {
  BRAND_MIN_BUDGET,
  MAX_PAYOUT_DEFAULT,
  MAX_PAYOUT_MAX,
  MAX_PAYOUT_MIN,
  MIN_RATE_PER_1K,
} from "@/lib/constants";
import { useToast } from "@/components/Toast";

/**
 * Brand campaign form — Brand Name, Brand Logo (optional), Campaign
 * Title, Platform (TikTok / Instagram / YouTube only), Rate per 1k
 * views (min $0.75), Total Budget (min $500), Max Payout Per Post
 * (default $75, $10–$200), Campaign Description, Video
 * Requirements. Saves with status "pending" — nothing goes live
 * until the admin approves it (after the $500+ budget is funded).
 *
 * Every validation failure shows the red error popup + shake + buzz
 * and blocks submit; a saved campaign shows the green "Success!"
 * popup. The API re-validates everything server-side too.
 */
export default function BrandForm({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { showError, showSuccess } = useToast();
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [ratePer1k, setRatePer1k] = useState("");
  const [budget, setBudget] = useState("");
  const [maxPayout, setMaxPayout] = useState(String(MAX_PAYOUT_DEFAULT));
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function fail(field: string, message: string) {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
    showError(message);
    return false;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    if (!isLoggedIn) {
      showError("Please log in or sign up first to submit a campaign.");
      return;
    }
    // Required fields first.
    if (!brandName.trim()) return fail("brandName", "This field is required");
    if (!title.trim()) return fail("title", "This field is required");
    if (!description.trim())
      return fail("description", "This field is required");
    if (!requirements.trim())
      return fail("requirements", "This field is required");
    // Money rules.
    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum < BRAND_MIN_BUDGET) {
      return fail("budget", `Error: Minimum budget is $${BRAND_MIN_BUDGET}`);
    }
    const rateNum = Number(ratePer1k);
    if (!Number.isFinite(rateNum) || rateNum < MIN_RATE_PER_1K) {
      return fail(
        "ratePer1k",
        `Error: Rate cannot be less than $${MIN_RATE_PER_1K} per 1k views`
      );
    }
    const capNum = Number(maxPayout);
    if (
      !Number.isFinite(capNum) ||
      capNum < MAX_PAYOUT_MIN ||
      capNum > MAX_PAYOUT_MAX
    ) {
      return fail(
        "maxPayout",
        `Error: Max payout per post must be between $${MAX_PAYOUT_MIN} and $${MAX_PAYOUT_MAX}`
      );
    }
    if (logoUrl.trim() && !/^https?:\/\//i.test(logoUrl.trim())) {
      return fail(
        "logoUrl",
        "Brand logo must be a full URL starting with http:// or https://."
      );
    }
    setBusy(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brandName.trim(),
          logoUrl: logoUrl.trim() || null,
          title: title.trim(),
          platform,
          ratePer1k: rateNum,
          budgetTotal: budgetNum,
          maxPayoutPerPost: capNum,
          description: description.trim(),
          requirements: requirements.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the campaign.");
      showSuccess(
        "Your campaign is under review. Admin will approve it soon."
      );
      setDone(true);
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Could not save the campaign."
      );
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none placeholder:text-fg/30 focus:border-lime";
  const errCls =
    "mt-1 text-sm font-bold text-red-300";

  if (done) {
    return (
      <div className="rounded-3xl border border-lime/40 bg-card p-8 text-center">
        <p className="text-4xl">🎉</p>
        <h3 className="mt-3 text-xl font-black text-fg">
          Campaign submitted
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/70">
          Your campaign is under review. Admin will approve it soon.
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fg/50">
          Once approved and funded, your campaign goes live to creators on
          TikTok, Instagram and YouTube.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl border border-fg/10 bg-card p-6"
    >
      <h2 className="text-xl font-extrabold text-fg">
        Create your campaign
      </h2>
      <p className="mt-1 text-sm text-fg/60">
        Minimum budget ${BRAND_MIN_BUDGET}. Your campaign stays pending until
        the admin approves it and the budget is funded.
      </p>
      {!isLoggedIn && (
        <p className="mt-4 rounded-xl bg-lime/10 px-4 py-3 text-sm font-semibold text-lime">
          Please log in or sign up first — your campaign will be saved to
          your account.
        </p>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-bold text-fg">
          Brand Name
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Your brand"
            className={inputCls}
          />
          {fieldErrors.brandName && (
            <span className={errCls}>{fieldErrors.brandName}</span>
          )}
        </label>
        <label className="block text-sm font-bold text-fg">
          Brand Logo <span className="font-medium text-fg/50">(optional)</span>
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://yourbrand.com/logo.png"
            inputMode="url"
            className={inputCls}
          />
          {fieldErrors.logoUrl && (
            <span className={errCls}>{fieldErrors.logoUrl}</span>
          )}
        </label>
        <label className="block text-sm font-bold text-fg">
          Campaign Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Show Your Energy"
            className={inputCls}
          />
          {fieldErrors.title && (
            <span className={errCls}>{fieldErrors.title}</span>
          )}
        </label>
        <label className="block text-sm font-bold text-fg">
          Platform
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className={inputCls}
          >
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
          </select>
        </label>
        <label className="block text-sm font-bold text-fg">
          Rate per 1k views (USD)
          <input
            type="number"
            min={MIN_RATE_PER_1K}
            step="0.01"
            value={ratePer1k}
            onChange={(e) => setRatePer1k(e.target.value)}
            placeholder="e.g. 2"
            className={inputCls}
          />
          <span className="mt-1 block text-xs font-medium text-fg/50">
            Minimum ${MIN_RATE_PER_1K} per 1,000 views.
          </span>
          {fieldErrors.ratePer1k && (
            <span className={errCls}>{fieldErrors.ratePer1k}</span>
          )}
        </label>
        <label className="block text-sm font-bold text-fg">
          Total Budget (USD, min ${BRAND_MIN_BUDGET})
          <input
            type="number"
            min={BRAND_MIN_BUDGET}
            step="1"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. 500"
            className={inputCls}
          />
          <span className="mt-1 block text-xs font-medium text-fg/50">
            Minimum ${BRAND_MIN_BUDGET} — funded upfront before launch.
          </span>
          {fieldErrors.budget && (
            <span className={errCls}>{fieldErrors.budget}</span>
          )}
        </label>
        <label className="block text-sm font-bold text-fg md:col-span-2">
          Max Payout Per Post (USD)
          <input
            type="number"
            min={MAX_PAYOUT_MIN}
            max={MAX_PAYOUT_MAX}
            step="1"
            value={maxPayout}
            onChange={(e) => setMaxPayout(e.target.value)}
            placeholder="75"
            className={inputCls}
          />
          <span className="mt-1 block text-xs font-medium leading-relaxed text-fg/50">
            Creator will never earn more than this on one post, even if
            views are higher. Example: rate $2 per 1k views, cap $75 — a
            video with 100k views earns $75, not $200. Range $
            {MAX_PAYOUT_MIN}–${MAX_PAYOUT_MAX}.
          </span>
          {fieldErrors.maxPayout && (
            <span className={errCls}>{fieldErrors.maxPayout}</span>
          )}
        </label>
      </div>
      <label className="mt-4 block text-sm font-bold text-fg">
        Campaign Description
        <span className="mt-1 block text-xs font-medium text-fg/50">
          Write it in four short parts: What to show · What NOT to show ·
          Hook · CTA. Creators read this before they film.
        </span>
        <textarea
          rows={7}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={`Example — write your brief in four short parts:

What to show: [Brand] is a [one-line product intro]. Show the product in real use, the result it gives, and your honest reaction.

What NOT to show: No competitor logos, no misleading claims, no adult or unsafe content, no reused clips from other creators.

Hook: Open with the problem in the first 3 seconds — e.g. "Stop wasting money on..." — then show the fix.

CTA: End by telling viewers to try [Brand] — link in bio, or use code CLIP10 for 10% off.`}
          className={`${inputCls} resize-none`}
        />
        {fieldErrors.description && (
          <span className={errCls}>{fieldErrors.description}</span>
        )}
      </label>
      <label className="mt-4 block text-sm font-bold text-fg">
        Video Requirements
        <span className="mt-1 block text-xs font-medium text-fg/50">
          The hard rules for every clip: format, hook, what must appear,
          and what is not allowed.
        </span>
        <textarea
          rows={4}
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="e.g. Hook in the first 3 seconds. Show the product clearly in the first 5 seconds. Vertical 9:16, captions on screen. No competitor logos. End with the CTA: try [Brand] today."
          className={`${inputCls} resize-none`}
        />
        {fieldErrors.requirements && (
          <span className={errCls}>{fieldErrors.requirements}</span>
        )}
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-full bg-lime py-3.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Submitting…" : "Submit campaign for review"}
      </button>
      <p className="mt-3 text-center text-xs text-fg/40">
        No payment is taken here. Funding happens directly with the platform
        owner via USDT, Bank Transfer or Wise before campaign goes live.
      </p>
    </form>
  );
}
