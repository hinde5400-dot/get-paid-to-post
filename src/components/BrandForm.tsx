"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_PAYOUT_DEFAULT,
  MAX_PAYOUT_MAX,
  MAX_PAYOUT_MIN,
} from "@/lib/constants";
import { platformFeeFor, totalToSend } from "@/lib/money";
import type { Platform } from "@/lib/types";
import { CAMPAIGN_CATEGORIES, isCampaignCategory } from "@/lib/types";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";
import {
  TikTokIcon,
  InstagramIcon,
  YouTubeIcon,
} from "@/components/PlatformIcons";

/**
 * Brand campaign form — Brand Name, Brand Logo (optional), Campaign
 * Title, Category (UGC / Clipping / Lifestyle / Entertainment /
 * Gaming / Technology, required, defaults to UGC), Platforms (pick
 * any of TikTok / Instagram / YouTube, at least one), Rate per 1k
 * views PER selected platform (any rate above $0 — your choice),
 * Total Budget (any amount above $0 — your choice, no minimum),
 * Max Payout Per Post (default $75, $10–$200), Minimum views per
 * clip (optional, 0 = no threshold) and Maximum payout per creator
 * (optional, blank = no cap), Campaign Description, Video
 * Requirements. Saves with status "pending" — nothing goes live
 * until the brand pays the budget in USDT on the payment page and
 * the admin approves it.
 *
 * Every validation failure shows the red error popup + shake + buzz
 * and blocks submit; a saved campaign redirects to the payment page.
 * The API re-validates everything server-side too.
 */
export default function BrandForm({
  isLoggedIn,
  initialBrandName,
}: {
  isLoggedIn: boolean;
  initialBrandName?: string | null;
}) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const [brandName, setBrandName] = useState(initialBrandName ?? "");
  const [logoUrl, setLogoUrl] = useState("");
  const [title, setTitle] = useState("");
  // Category (P1-a): one of the six Content Rewards-style
  // categories; required, defaults to UGC.
  const [category, setCategory] = useState<string>("UGC");
  const [platforms, setPlatforms] = useState<Platform[]>(["tiktok"]);
  // Per-platform rates (P1-b): one rate per selected platform —
  // e.g. TikTok $1.50/1k, YouTube $2.00/1k. Values persist when a
  // platform is toggled off and back on.
  const [rates, setRates] = useState<Partial<Record<Platform, string>>>({
    tiktok: "",
  });
  const [minViews, setMinViews] = useState("");
  const [maxPayoutPerCreator, setMaxPayoutPerCreator] = useState("");
  const [budget, setBudget] = useState("");
  const [maxPayout, setMaxPayout] = useState(String(MAX_PAYOUT_DEFAULT));
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [briefUrl, setBriefUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function fail(field: string, message: string) {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
    showError(message);
    return false;
  }

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
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
    if (!isCampaignCategory(category)) {
      return fail(
        "category",
        "Error: Category must be one of UGC, Clipping, Lifestyle, Entertainment, Gaming, Technology."
      );
    }
    if (!description.trim())
      return fail("description", "This field is required");
    if (!requirements.trim())
      return fail("requirements", "This field is required");
    // Platforms — at least one is required.
    if (platforms.length === 0) {
      return fail("platforms", "Select at least one platform");
    }
    // Money rules — any budget above $0 and any rate above $0.
    // There is no minimum budget and no minimum rate: your choice.
    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      return fail("budget", "Error: Budget must be more than $0");
    }
    // Per-platform rates (P1-b): every selected platform needs its
    // own rate above $0.
    const platformLabel = (p: Platform) =>
      p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "YouTube";
    const ratesNum: Partial<Record<Platform, number>> = {};
    for (const p of platforms) {
      const v = Number(rates[p] ?? "");
      if (!Number.isFinite(v) || v <= 0) {
        return fail(
          `rate-${p}`,
          `Error: Rate for ${platformLabel(p)} must be more than $0 per 1k views`
        );
      }
      ratesNum[p] = v;
    }
    // Minimum views per clip (P1-b, optional): 0 / blank = no threshold.
    const minViewsNum =
      minViews.trim() === "" ? 0 : Math.floor(Number(minViews));
    if (!Number.isFinite(minViewsNum) || minViewsNum < 0) {
      return fail(
        "minViews",
        "Error: Minimum views per clip must be 0 or more"
      );
    }
    // Max payout per creator (P1-b, optional): blank = no cap.
    const maxPerCreatorNum =
      maxPayoutPerCreator.trim() === ""
        ? null
        : Number(maxPayoutPerCreator);
    if (
      maxPerCreatorNum !== null &&
      (!Number.isFinite(maxPerCreatorNum) || maxPerCreatorNum <= 0)
    ) {
      return fail(
        "maxPayoutPerCreator",
        "Error: Maximum payout per creator must be more than $0"
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
    // Optional links — if given, they must be full URLs.
    if (briefUrl.trim() && !/^https?:\/\//i.test(briefUrl.trim())) {
      return fail(
        "briefUrl",
        "Campaign Brief link must be a full URL starting with http:// or https://."
      );
    }
    if (thumbnailUrl.trim() && !/^https?:\/\//i.test(thumbnailUrl.trim())) {
      return fail(
        "thumbnailUrl",
        "Thumbnail Image Link must be a full URL starting with http:// or https://."
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
          category,
          platforms,
          // Legacy single-platform column: "all" when all three are
          // chosen, otherwise the first chosen platform.
          platform: platforms.length === 3 ? "all" : platforms[0],
          // Per-platform rates (P1-b); the legacy single rate is the
          // first selected platform's rate.
          rates: ratesNum,
          ratePer1k: ratesNum[platforms[0]],
          minViews: minViewsNum,
          maxPayoutPerCreator: maxPerCreatorNum,
          budgetTotal: budgetNum,
          maxPayoutPerPost: capNum,
          description: description.trim(),
          requirements: requirements.trim(),
          briefUrl: briefUrl.trim() || null,
          thumbnailUrl: thumbnailUrl.trim() || null,
          durationDays: durationDays === "" ? null : Number(durationDays),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the campaign.");
      showSuccess(
        "Your campaign is under review. Admin will approve it soon."
      );
      setDone(true);
      // Next step is payment: the campaign stays pending until the
      // brand sends the budget in USDT on the payment page.
      if (data.id) router.push(`/brands/payment/${data.id}`);
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
          Next step: send your budget in USDT on the payment page. Your
          campaign goes live once the admin verifies your payment.
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fg/50">
          Once approved and funded, your campaign goes live to creators
          on the platforms you chose.
        </p>
      </div>
    );
  }

  // Live calculation example, updating as the brand types the rates
  // and budget. Defaults ($1 per 1k, $200 budget) show the exact
  // example while the fields are empty. With different rates per
  // platform, the estimate uses the AVERAGE of the entered rates
  // across the selected platforms — it is an estimate, labelled so.
  const enteredRates = platforms
    .map((p) => Number(rates[p] ?? ""))
    .filter((v) => Number.isFinite(v) && v > 0);
  const exampleRate =
    enteredRates.length > 0
      ? enteredRates.reduce((a, b) => a + b, 0) / enteredRates.length
      : 1;
  const exampleBudget =
    Number.isFinite(Number(budget)) && Number(budget) > 0
      ? Number(budget)
      : 200;
  const exampleViews = Math.round((exampleBudget / exampleRate) * 1000);
  // Platform fee: 15% flat, charged ON TOP of the budget. You
  // send budget + fee; the creators pool is the full budget.
  const exampleFee = platformFeeFor(exampleBudget);
  const exampleTotal = totalToSend(exampleBudget);
  const budgetNum = Number(budget);
  const liveFeeSplit =
    Number.isFinite(budgetNum) && budgetNum > 0
      ? {
          fee: platformFeeFor(budgetNum),
          total: totalToSend(budgetNum),
        }
      : null;
  const fmtChoice = (n: number) =>
    `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl border border-fg/10 bg-card p-6"
    >
      <h2 className="text-xl font-extrabold text-fg">
        Create your campaign
      </h2>
      <p className="mt-1 text-sm text-fg/60">
        Set any rate and any budget — no minimums. After you submit,
        you will send your budget in USDT on the payment page; your
        campaign goes live once the admin verifies your payment.
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
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputCls}
          >
            {CAMPAIGN_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-medium text-fg/50">
            What kind of clips is this campaign for? Creators browse by
            category.
          </span>
          {fieldErrors.category && (
            <span className={errCls}>{fieldErrors.category}</span>
          )}
        </label>
        <div className="block text-sm font-bold text-fg md:col-span-2">
          Platforms
          <span className="mt-1 block text-xs font-medium text-fg/50">
            Pick at least one — creators post on the platforms you choose.
          </span>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(
              [
                { key: "tiktok", label: "TikTok", Icon: TikTokIcon },
                { key: "instagram", label: "Instagram", Icon: InstagramIcon },
                { key: "youtube", label: "YouTube", Icon: YouTubeIcon },
              ] as const
            ).map(({ key, label, Icon }) => {
              const checked = platforms.includes(key);
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-bold transition ${
                    checked
                      ? "border-lime/60 bg-lime/10 text-fg"
                      : "border-fg/15 bg-ink text-fg/70 hover:border-fg/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePlatform(key)}
                    className="h-5 w-5 shrink-0 accent-[#C6FF00]"
                  />
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </label>
              );
            })}
          </div>
          {fieldErrors.platforms && (
            <span className={errCls}>{fieldErrors.platforms}</span>
          )}
        </div>
        {/* Per-platform rates (P1-b): one rate input per selected
            platform — different platforms can pay different rates,
            e.g. TikTok $1.50/1k, YouTube $2.00/1k. */}
        <div className="block text-sm font-bold text-fg">
          Rate Per 1000 Views (Your Choice)
          <span className="mt-1 block text-xs font-medium text-fg/50">
            One rate per platform — each must be more than $0. Higher
            rate = More creators will join fast.
          </span>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {platforms.map((p) => {
              const label =
                p === "tiktok"
                  ? "TikTok"
                  : p === "instagram"
                    ? "Instagram"
                    : "YouTube";
              return (
                <label
                  key={p}
                  className="block text-xs font-bold text-fg/80"
                >
                  {label} rate / 1k views ($)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={rates[p] ?? ""}
                    onChange={(e) =>
                      setRates((prev) => ({ ...prev, [p]: e.target.value }))
                    }
                    placeholder="e.g. 1"
                    className={inputCls}
                  />
                  {fieldErrors[`rate-${p}`] && (
                    <span className={errCls}>
                      {fieldErrors[`rate-${p}`]}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
        <label className="block text-sm font-bold text-fg">
          Budget (Your Choice)
          <input
            type="number"
            min={1}
            step="1"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. 200"
            className={inputCls}
          />
          <span className="mt-1 block text-xs font-medium text-fg/50">
            Any amount above $0 — funded upfront before launch.
          </span>
          {liveFeeSplit && (
            <span className="mt-1 block text-xs font-semibold text-lime">
              Budget {fmtChoice(budgetNum)} + Platform fee (15%):{" "}
              {fmtChoice(liveFeeSplit.fee)} = Total to send{" "}
              {fmtChoice(liveFeeSplit.total)} · Creators pool (full
              budget): {fmtChoice(budgetNum)}.
            </span>
          )}
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
        <label className="block text-sm font-bold text-fg">
          Minimum views per clip{" "}
          <span className="font-medium text-fg/50">(optional)</span>
          <input
            type="number"
            min={0}
            step="1"
            value={minViews}
            onChange={(e) => setMinViews(e.target.value)}
            placeholder="e.g. 1000"
            className={inputCls}
          />
          <span className="mt-1 block text-xs font-medium leading-relaxed text-fg/50">
            A clip needs at least this many views before it can be
            approved. Leave blank for no minimum (0) — every clip with
            real views can earn.
          </span>
          {fieldErrors.minViews && (
            <span className={errCls}>{fieldErrors.minViews}</span>
          )}
        </label>
        <label className="block text-sm font-bold text-fg">
          Maximum payout per creator ($){" "}
          <span className="font-medium text-fg/50">(optional)</span>
          <input
            type="number"
            min={0}
            step="1"
            value={maxPayoutPerCreator}
            onChange={(e) => setMaxPayoutPerCreator(e.target.value)}
            placeholder="e.g. 500"
            className={inputCls}
          />
          <span className="mt-1 block text-xs font-medium leading-relaxed text-fg/50">
            The most one creator can earn from this campaign in total,
            across all their approved clips. Leave blank for no cap.
            This is on top of the 15-approved-clips-per-platform limit.
          </span>
          {fieldErrors.maxPayoutPerCreator && (
            <span className={errCls}>{fieldErrors.maxPayoutPerCreator}</span>
          )}
        </label>
        <label className="block text-sm font-bold text-fg md:col-span-2">
          Campaign Duration
          <select
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className={inputCls}
          >
            <option value="">Until Budget Ends</option>
            <option value="7">7 Days</option>
            <option value="14">14 Days</option>
            <option value="30">30 Days</option>
          </select>
          <span className="mt-1 block text-xs font-medium leading-relaxed text-fg/50">
            Your campaign ends when the duration finishes or the budget
            runs out — whichever comes first.
          </span>
        </label>
        <label className="block text-sm font-bold text-fg md:col-span-2">
          Campaign Brief / Google Drive Link{" "}
          <span className="font-medium text-fg/50">(optional)</span>
          <input
            value={briefUrl}
            onChange={(e) => setBriefUrl(e.target.value)}
            placeholder="https://drive.google.com/..."
            inputMode="url"
            className={inputCls}
          />
          <span className="mt-1 block text-xs font-medium text-fg/50">
            Paste your Drive link with videos, logos, assets for creators.
          </span>
          {fieldErrors.briefUrl && (
            <span className={errCls}>{fieldErrors.briefUrl}</span>
          )}
        </label>
        <label className="block text-sm font-bold text-fg md:col-span-2">
          Thumbnail Image Link{" "}
          <span className="font-medium text-fg/50">(optional)</span>
          <input
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
            placeholder="https://yourbrand.com/campaign-thumbnail.jpg"
            inputMode="url"
            className={inputCls}
          />
          <span className="mt-1 block text-xs font-medium text-fg/50">
            Paste an image link — it will be used as the campaign banner
            image. There is no file upload; link only.
          </span>
          {fieldErrors.thumbnailUrl && (
            <span className={errCls}>{fieldErrors.thumbnailUrl}</span>
          )}
        </label>
      </div>
      {/* Live calculation example — updates as the brand types. The
          views figure is an estimate from the average rate across
          the selected platforms (exact views depend on which
          platform each clip is posted on). */}
      <div className="mt-4 rounded-2xl bg-lime/10 px-4 py-3 text-sm font-semibold leading-relaxed text-lime">
        Example (estimate, at the average rate of{" "}
        {fmtChoice(Math.round(exampleRate * 100) / 100)} per 1k across
        your selected platforms): If you set a budget of{" "}
        {fmtChoice(exampleBudget)}, you will get approx{" "}
        {exampleViews.toLocaleString("en-US")} views. Budget{" "}
        {fmtChoice(exampleBudget)} + Platform fee (15%):{" "}
        {fmtChoice(exampleFee)} = Total to send{" "}
        {fmtChoice(exampleTotal)} · Creators pool (full budget):{" "}
        {fmtChoice(exampleBudget)}.
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
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <Spinner /> Loading...
          </>
        ) : (
          "Submit campaign for review"
        )}
      </button>
      <p className="mt-3 text-center text-xs text-fg/40">
        No payment is taken here. After you submit, send your budget
        plus the 15% platform fee in USDT (TRC20) to the admin wallet
        on the payment page — your campaign goes live once the admin
        verifies your payment.
      </p>
    </form>
  );
}
