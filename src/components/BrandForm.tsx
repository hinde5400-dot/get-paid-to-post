"use client";

import { useState } from "react";
import { BRAND_MIN_BUDGET } from "@/lib/constants";

export default function BrandForm({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [brandName, setBrandName] = useState("");
  const [title, setTitle] = useState("");
  const [rate, setRate] = useState("");
  const [budget, setBudget] = useState("");
  const [category, setCategory] = useState("General");
  const [platform, setPlatform] = useState("all");
  const [description, setDescription] = useState("");
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
    if (Number(rate) <= 0) {
      setError("Please set a rate per 1M views above $0.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brandName.trim(),
          title: title.trim(),
          ratePer1m: Number(rate),
          budgetTotal: budgetNum,
          category,
          platform,
          description: description.trim(),
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
    "mt-1 w-full rounded-xl border border-white/15 bg-ink px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-sun";

  if (done) {
    return (
      <div className="rounded-3xl border border-sun/40 bg-card p-8 text-center">
        <p className="text-4xl">🎉</p>
        <h3 className="mt-3 text-xl font-black text-white">
          Campaign draft saved
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/70">
          Your campaign is saved as an <strong>unfunded draft</strong> — it is
          not live yet. The platform owner will contact you to agree the rate
          and collect the budget upfront. Once the budget is funded, your
          campaign goes live to creators.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl border border-white/10 bg-card p-6"
    >
      <h2 className="text-xl font-extrabold text-white">
        Create your campaign
      </h2>
      <p className="mt-1 text-sm text-white/60">
        Minimum budget ${BRAND_MIN_BUDGET}. Your campaign stays a draft until
        the budget is funded.
      </p>
      {!isLoggedIn && (
        <p className="mt-4 rounded-xl bg-sun/10 px-4 py-3 text-sm font-semibold text-sun">
          Please log in or sign up first — your draft will be saved to your
          account.
        </p>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-bold text-white">
          Brand name
          <input
            required
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Your brand"
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-bold text-white">
          Campaign title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Show Your Energy"
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-bold text-white">
          Rate per 1M views (USD)
          <input
            required
            type="number"
            min="1"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 1450"
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-bold text-white">
          Total budget (USD, min ${BRAND_MIN_BUDGET})
          <input
            required
            type="number"
            min={BRAND_MIN_BUDGET}
            step="1"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. 5000"
            className={inputCls}
          />
        </label>
        <label className="block text-sm font-bold text-white">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputCls}
          >
            {["General", "Drinks", "Beauty", "Fitness", "Tech", "Travel", "Food & Drink", "Fashion", "Music", "Gaming", "Apps", "Education"].map(
              (c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              )
            )}
          </select>
        </label>
        <label className="block text-sm font-bold text-white">
          Platform
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className={inputCls}
          >
            <option value="all">TikTok · Instagram · YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
          </select>
        </label>
      </div>
      <label className="mt-4 block text-sm font-bold text-white">
        Campaign description &amp; brief
        <textarea
          required
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What should creators show? What is the hook, the product, the vibe?"
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
        className="mt-6 w-full rounded-full bg-sun py-3.5 text-sm font-bold text-ink transition hover:bg-sundark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save as unfunded draft"}
      </button>
      <p className="mt-3 text-center text-xs text-white/40">
        No payment is taken here. Funding happens directly with the platform
        owner (USDT, Pakistani bank, or Wise) before the campaign goes live.
      </p>
    </form>
  );
}
