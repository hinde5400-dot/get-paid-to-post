"use client";

import { useState } from "react";
import { BRAND_MIN_BUDGET } from "@/lib/constants";

/**
 * Brand campaign form — exactly the owner's fields: Brand Name, Brand
 * Logo (optional logo URL), Campaign Title, Platform (TikTok /
 * Instagram / YouTube only), Rate per 1k views, Total Budget,
 * Campaign Description, Video Requirements. Saves with status
 * "pending" — nothing goes live until the admin approves it (after
 * the $500+ budget is funded).
 */
export default function BrandForm({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [ratePer1k, setRatePer1k] = useState("");
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const budgetNum = Number(budget);
    if (budgetNum < BRAND_MIN_BUDGET) {
      setError(
        `Minimum budget to launch a campaign is $${BRAND_MIN_BUDGET}. Please raise your budget.`
      );
      return;
    }
    if (Number(ratePer1k) <= 0) {
      setError("Please set a rate per 1,000 views above $0.");
      return;
    }
    if (logoUrl.trim() && !/^https?:\/\//i.test(logoUrl.trim())) {
      setError("Brand logo must be a full URL starting with http:// or https://.");
      return;
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
          ratePer1k: Number(ratePer1k),
          budgetTotal: budgetNum,
          description: description.trim(),
          requirements: requirements.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the campaign.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the campaign.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none placeholder:text-fg/30 focus:border-lime";

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
            required
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Your brand"
            className={inputCls}
          />
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
        </label>
        <label className="block text-sm font-bold text-fg">
          Campaign Title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Show Your Energy"
            className={inputCls}
          />
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
            required
            type="number"
            min="0.01"
            step="0.01"
            value={ratePer1k}
            onChange={(e) => setRatePer1k(e.target.value)}
            placeholder="e.g. 0.75"
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-bold text-fg">
          Total Budget (USD, min ${BRAND_MIN_BUDGET})
          <input
            required
            type="number"
            min={BRAND_MIN_BUDGET}
            step="1"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. 500"
            className={inputCls}
          />
        </label>
      </div>
      <label className="mt-4 block text-sm font-bold text-fg">
        Campaign Description
        <textarea
          required
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this campaign about? What should creators show?"
          className={`${inputCls} resize-none`}
        />
      </label>
      <label className="mt-4 block text-sm font-bold text-fg">
        Video Requirements
        <textarea
          required
          rows={3}
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="e.g. Vertical 9:16, captions on screen, hook in the first 3 seconds, show the product clearly."
          className={`${inputCls} resize-none`}
        />
      </label>
      {error && (
        <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !isLoggedIn}
        className="mt-6 w-full rounded-full bg-lime py-3.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Submitting…" : "Submit campaign for review"}
      </button>
      <p className="mt-3 text-center text-xs text-fg/40">
        No payment is taken here. Funding happens directly with the platform
        owner (USDT, Pakistani bank, or Wise) before the campaign goes live.
      </p>
    </form>
  );
}
