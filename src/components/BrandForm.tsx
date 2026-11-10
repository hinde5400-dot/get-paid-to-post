"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MAX_PAYOUT_DEFAULT,
  MAX_PAYOUT_MAX,
  MAX_PAYOUT_MIN,
} from "@/lib/constants";
import { platformFeeFor, payoutForViews, totalToSend } from "@/lib/money";
import type { Platform } from "@/lib/types";
import { CAMPAIGN_CATEGORIES, isCampaignCategory } from "@/lib/types";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";
import ImageUploadField from "@/components/ImageUploadField";
import {
  TikTokIcon,
  InstagramIcon,
  YouTubeIcon,
} from "@/components/PlatformIcons";

/**
 * Brand campaign form — Brand Name, Brand Logo (REQUIRED file
 * upload), Campaign Title, Category (UGC / Clipping / Lifestyle /
 * Entertainment / Gaming / Technology, required, defaults to UGC),
 * Platforms (pick any of TikTok / Instagram / YouTube, at least
 * one), ONE Rate per 1k views for ALL selected platforms (any rate
 * above $0 — your choice; the same rate applies to TikTok,
 * Instagram and YouTube equally), Total Budget (any amount above
 * $0 — your choice, no minimum), Max Payout Per Post (default
 * $100, $10–$200), Minimum views per clip (floor 1,000 — blank by
 * default, blank = 1,000, values below 1,000 are rejected),
 * Campaign Brief (required, content instructions), Video
 * Requirements (required), Google Drive Link (required — the
 * content lives in Drive), Thumbnail (REQUIRED file upload).
 * Brand Logo and Thumbnail are file uploads with an upload button
 * (Turn's decision 2026-11-10) — NOT link fields: PNG, JPG or
 * WebP, max 2 MB each, uploaded to the public 'campaign-images'
 * bucket at confirmed submit (migration 0032). There is NO
 * per-creator payout cap: a creator's earnings depend on their
 * views across their clips. Saves with status "pending" — nothing
 * goes live until the brand pays the budget in USDT on the payment
 * page and the admin approves it.
 *
 * Every validation failure names the field, shows the red error
 * popup + shake + buzz, scrolls to the first invalid field and
 * focuses it, and blocks submit; a saved campaign redirects to the
 * payment page. The API re-validates everything server-side too.
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
  // Brand Logo + Thumbnail (Turn's decision 2026-11-10): REQUIRED
  // file uploads, NOT link fields. The files are picked here (local
  // preview only) and uploaded at confirmed submit — the returned
  // storage URLs are what the campaign POST sends.
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(
    null
  );

  function pickLogo(f: File | null) {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(f);
    setLogoPreview(f ? URL.createObjectURL(f) : null);
  }

  function pickThumbnail(f: File | null) {
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailFile(f);
    setThumbnailPreview(f ? URL.createObjectURL(f) : null);
  }

  // Free the local preview URLs when the form unmounts.
  useEffect(
    () => () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    },
    // Previews are only ever replaced through pickLogo /
    // pickThumbnail (which revoke the old one); the cleanup only
    // needs to run once, on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [title, setTitle] = useState("");
  // Category (P1-a): one of the six Content Rewards-style
  // categories; required, defaults to UGC.
  const [category, setCategory] = useState<string>("UGC");
  const [platforms, setPlatforms] = useState<Platform[]>(["tiktok"]);
  // Single rate (item 2): ONE rate per 1k views for the whole
  // campaign — the same rate applies to TikTok, Instagram and
  // YouTube equally. On submit every selected platform's rate is
  // set to this value.
  const [rate, setRate] = useState("");
  // Minimum views per clip (item 3): BLANK by default (placeholder
  // "e.g. 1000") — blank means the 1,000 floor applies.
  const [minViews, setMinViews] = useState("");
  const [budget, setBudget] = useState("");
  const [maxPayout, setMaxPayout] = useState(String(MAX_PAYOUT_DEFAULT));
  // Campaign Brief (item 5): the textarea that was "Campaign
  // Description" — same DB column (`description`), relabelled and
  // moved above Video Requirements. Required: creators need these
  // content instructions (what to show, who to tag, hook, CTA).
  const [brief, setBrief] = useState("");
  const [requirements, setRequirements] = useState("");
  // Google Drive Link (item 6): REQUIRED — the content lives in
  // Drive. Sent as `briefUrl` (the `brief_url` DB column).
  const [driveUrl, setDriveUrl] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  // Pre-submit review step: when validation passes, the form shows
  // a "Review your campaign" panel instead of submitting at once.
  // The form state underneath stays intact for editing.
  const [reviewing, setReviewing] = useState(false);
  const [ackUnset, setAckUnset] = useState(false);

  function fail(field: string, message: string) {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
    showError(message);
    // Item 8: scroll the first invalid field into view and focus
    // it, so the brand sees exactly where the error is (the toast
    // alone is not enough). The field element exists already — the
    // error text renders under it on the next paint.
    requestAnimationFrame(() => {
      const el = document.getElementById(`field-${field}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Hidden file inputs are skipped (the upload fields focus
      // their Upload button instead).
      const focusable = el?.querySelector(
        "input:not([type='file']), select, textarea, button"
      ) as HTMLElement | null;
      focusable?.focus({ preventScroll: true });
    });
    return false;
  }

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  // Upload one campaign image (logo or thumbnail) to the public
  // 'campaign-images' bucket (migration 0032). Returns the public
  // URL the campaign POST stores in logo_url / thumbnail_url.
  async function uploadImage(file: File, kind: "logo" | "thumbnail") {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const res = await fetch("/api/campaigns/upload-image", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || "Could not upload the image.");
    return String(data.url ?? "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    if (!isLoggedIn) {
      showError("Please log in or sign up first to submit a campaign.");
      return;
    }
    // Required fields first. Every message names its field
    // (item 8) — a bare "This field is required" never says where.
    if (!brandName.trim())
      return fail("brandName", "Brand Name is required");
    // Brand Logo (Turn's decision 2026-11-10): REQUIRED file
    // upload — no link field any more.
    if (!logoFile)
      return fail(
        "logoUrl",
        "Brand Logo is required — upload your logo image."
      );
    if (!title.trim())
      return fail("title", "Campaign Title is required");
    if (!isCampaignCategory(category)) {
      return fail(
        "category",
        `Category must be one of ${CAMPAIGN_CATEGORIES.join(", ")}.`
      );
    }
    if (!brief.trim())
      return fail("brief", "Campaign Brief is required");
    if (!requirements.trim())
      return fail("requirements", "Video Requirements is required");
    // Platforms — at least one is required.
    if (platforms.length === 0) {
      return fail("platforms", "Platforms: select at least one platform");
    }
    // Money rules — any budget above $0 and any rate above $0.
    // There is no minimum budget and no minimum rate: your choice.
    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      return fail("budget", "Budget must be more than $0");
    }
    // Single rate (item 2): ONE rate for all platforms — it must
    // be more than $0 per 1k views.
    const rateNum = Number(rate);
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      return fail(
        "rate",
        "Rate Per 1000 Views must be more than $0 per 1k views"
      );
    }
    // Minimum views per clip: floor 1,000. Blank = 1,000 (the
    // floor default); anything below 1,000 is rejected.
    const minViewsNum =
      minViews.trim() === "" ? 1000 : Math.floor(Number(minViews));
    if (!Number.isFinite(minViewsNum) || minViewsNum < 1000) {
      return fail(
        "minViews",
        "Minimum views per clip must be at least 1,000"
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
        `Max Payout Per Post must be between $${MAX_PAYOUT_MIN} and $${MAX_PAYOUT_MAX}`
      );
    }
    // Google Drive Link (item 6): REQUIRED, and a valid URL. Any
    // valid URL is accepted — Drive links come in several forms,
    // so the domain is NOT restricted to drive.google.com.
    if (!driveUrl.trim()) {
      return fail("driveUrl", "Google Drive Link is required");
    }
    if (!/^https?:\/\/.+\..+/.test(driveUrl.trim())) {
      return fail(
        "driveUrl",
        "Google Drive Link must be a valid URL starting with http:// or https://."
      );
    }
    // Thumbnail (Turn's decision 2026-11-10): REQUIRED file
    // upload — no link field any more.
    if (!thumbnailFile)
      return fail(
        "thumbnailUrl",
        "Thumbnail is required — upload a banner image."
      );
    // Pre-submit review step: all required validation passed, so
    // show the review panel first. The second submit (from the
    // review panel, with reviewing already true) runs the POST
    // below unchanged.
    if (!reviewing) {
      setAckUnset(false);
      setReviewing(true);
      return;
    }
    // Confirmed submit from the review panel: if any optional
    // setting is unset, the brand must tick "I understand — submit
    // anyway" first (the button is disabled until then; this is a
    // backstop in case submit is triggered another way). Logo and
    // thumbnail are REQUIRED uploads, so they are never "unset
    // optional" any more — only duration and min views are.
    const hasUnsetOptional =
      durationDays === "" || minViews.trim() === "";
    if (hasUnsetOptional && !ackUnset) {
      showError("Please tick “I understand — submit anyway” to continue.");
      return;
    }
    // Both images passed validation above, so they are set here —
    // narrow them once for the upload step below.
    const logo = logoFile;
    const thumbnail = thumbnailFile;
    if (!logo || !thumbnail) {
      showError("Brand Logo and Thumbnail are both required.");
      return;
    }
    setBusy(true);
    try {
      // Upload the images first (at confirmed submit only — a
      // brand that goes "Back to edit" never uploads anything),
      // then create the campaign with the returned storage URLs.
      const logoUrl = await uploadImage(logo, "logo");
      const thumbnailUrl = await uploadImage(thumbnail, "thumbnail");
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brandName.trim(),
          logoUrl,
          title: title.trim(),
          category,
          platforms,
          // Legacy single-platform column: "all" when all three are
          // chosen, otherwise the first chosen platform.
          platform: platforms.length === 3 ? "all" : platforms[0],
          // Single rate (item 2): every selected platform's rate
          // is this one value, and the legacy single rate is the
          // same value — rates JSONB + legacy fields stay in sync.
          rates: Object.fromEntries(platforms.map((p) => [p, rateNum])),
          ratePer1k: rateNum,
          minViews: minViewsNum,
          budgetTotal: budgetNum,
          maxPayoutPerPost: capNum,
          // Campaign Brief (item 5) is stored in the `description`
          // column; the Drive link (item 6, required) in `brief_url`.
          description: brief.trim(),
          requirements: requirements.trim(),
          briefUrl: driveUrl.trim(),
          thumbnailUrl,
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

  // Live calculation example, updating as the brand types the rate
  // and budget. Defaults ($1 per 1k, $200 budget) show the exact
  // example while the fields are empty. One rate applies to every
  // platform, so the estimate uses that single rate — it is an
  // estimate, labelled so.
  const enteredRate = Number(rate);
  const exampleRate =
    Number.isFinite(enteredRate) && enteredRate > 0 ? enteredRate : 1;
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

  // Item 9: the Max Payout Per Post help example uses the brand's
  // ENTERED rate + cap — at 100k views the clip earns
  // min(100 × rate, cap). Fallbacks ($2 rate, $100 cap) keep the
  // old example while the fields are still empty.
  const capExampleRate =
    Number.isFinite(Number(rate)) && Number(rate) > 0 ? Number(rate) : 2;
  const capExampleCap =
    Number.isFinite(Number(maxPayout)) && Number(maxPayout) > 0
      ? Number(maxPayout)
      : MAX_PAYOUT_DEFAULT;
  const capExample = payoutForViews(100000, capExampleRate, capExampleCap);

  // Values shown on the pre-submit review panel (only reached
  // after validation passes, so budget / rate / min views are
  // all valid numbers here).
  const reviewBudget = Number(budget);
  const reviewFee = platformFeeFor(reviewBudget);
  const reviewTotal = totalToSend(reviewBudget);
  const reviewRate = Number(rate);
  const reviewMinViewsBlank = minViews.trim() === "";
  const reviewMinViews = reviewMinViewsBlank
    ? 1000
    : Math.floor(Number(minViews));
  const reviewUnset = {
    duration: durationDays === "",
    minViews: reviewMinViewsBlank,
  };
  const reviewHasUnset = Object.values(reviewUnset).some(Boolean);
  const reviewPlatformName = (p: Platform) =>
    p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "YouTube";
  const reviewTrunc = (s: string) =>
    s.length > 200 ? `${s.slice(0, 200)}…` : s;

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
      {reviewing ? (
        <div className="mt-5">
          <h3 className="text-lg font-extrabold text-fg">
            Review your campaign
          </h3>
          <p className="mt-1 text-sm text-fg/60">
            Check every setting below before you submit. Amber rows are
            optional settings you left unset — the default shown will
            apply.
          </p>
          <div className="mt-4 grid gap-2">
            <div className="rounded-xl border border-fg/10 bg-ink px-4 py-3">
              <p className="text-xs font-bold text-fg/50">Brand Name</p>
              <p className="mt-0.5 text-sm font-semibold text-fg">{brandName.trim()}</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-fg/10 bg-ink px-4 py-3">
              <p className="text-xs font-bold text-fg/50">Brand Logo</p>
              {logoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreview}
                  alt="Brand logo preview"
                  className="h-12 w-12 rounded-lg object-cover"
                />
              )}
              <p className="mt-0.5 min-w-0 truncate text-sm font-semibold text-fg">
                {logoFile?.name ?? "Logo selected"}
              </p>
            </div>
            <div className="rounded-xl border border-fg/10 bg-ink px-4 py-3">
              <p className="text-xs font-bold text-fg/50">Campaign Title</p>
              <p className="mt-0.5 text-sm font-semibold text-fg">{title.trim()}</p>
            </div>
            <div className="rounded-xl border border-fg/10 bg-ink px-4 py-3">
              <p className="text-xs font-bold text-fg/50">Category</p>
              <p className="mt-0.5 text-sm font-semibold text-fg">{category}</p>
            </div>
            <div className="rounded-xl border border-fg/10 bg-ink px-4 py-3">
              <p className="text-xs font-bold text-fg/50">Platforms</p>
              <p className="mt-0.5 text-sm font-semibold text-fg">
                {platforms.map(reviewPlatformName).join(", ")}
              </p>
              <p className="mt-1 text-sm text-fg/70">
                One rate for all platforms:{" "}
                {fmtChoice(reviewRate)} per 1k views
              </p>
            </div>
            <div className="rounded-xl border border-fg/10 bg-ink px-4 py-3">
              <p className="text-xs font-bold text-fg/50">Total Budget</p>
              <p className="mt-0.5 text-sm font-semibold text-fg">
                Budget {fmtChoice(reviewBudget)} + 15% platform fee{" "}
                {fmtChoice(reviewFee)} = Total to send{" "}
                {fmtChoice(reviewTotal)}
              </p>
              <p className="mt-1 text-sm text-fg/70">
                Creators pool (full budget): {fmtChoice(reviewBudget)}
              </p>
            </div>
            <div className="rounded-xl border border-fg/10 bg-ink px-4 py-3">
              <p className="text-xs font-bold text-fg/50">
                Max Payout Per Post
              </p>
              <p className="mt-0.5 text-sm font-semibold text-fg">
                {fmtChoice(Number(maxPayout))}
              </p>
            </div>
            <div
              className={`rounded-xl border px-4 py-3 ${
                reviewUnset.minViews
                  ? "border-amber-400/50 bg-amber-500/10"
                  : "border-fg/10 bg-ink"
              }`}
            >
              <p className="text-xs font-bold text-fg/50">
                Minimum views per clip
              </p>
              {reviewUnset.minViews ? (
                <p className="mt-0.5 text-sm font-semibold text-amber-200">
                  Not set — 1,000 minimum applies (
                  {reviewMinViews.toLocaleString("en-US")} views)
                </p>
              ) : (
                <p className="mt-0.5 text-sm font-semibold text-fg">
                  {reviewMinViews.toLocaleString("en-US")} views
                </p>
              )}
            </div>
            <div
              className={`rounded-xl border px-4 py-3 ${
                reviewUnset.duration
                  ? "border-amber-400/50 bg-amber-500/10"
                  : "border-fg/10 bg-ink"
              }`}
            >
              <p className="text-xs font-bold text-fg/50">Duration</p>
              {reviewUnset.duration ? (
                <p className="mt-0.5 text-sm font-semibold text-amber-200">
                  Not set — runs until the budget ends
                </p>
              ) : (
                <p className="mt-0.5 text-sm font-semibold text-fg">
                  {durationDays} days
                </p>
              )}
            </div>
            <div className="rounded-xl border border-fg/10 bg-ink px-4 py-3">
              <p className="text-xs font-bold text-fg/50">
                Google Drive Link
              </p>
              <p className="mt-0.5 break-all text-sm font-semibold text-fg">
                {driveUrl.trim()}
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-fg/10 bg-ink px-4 py-3">
              <p className="text-xs font-bold text-fg/50">Thumbnail</p>
              {thumbnailPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailPreview}
                  alt="Thumbnail preview"
                  className="h-12 w-20 rounded-lg object-cover"
                />
              )}
              <p className="mt-0.5 min-w-0 truncate text-sm font-semibold text-fg">
                {thumbnailFile?.name ?? "Thumbnail selected"}
              </p>
            </div>
            <div className="rounded-xl border border-fg/10 bg-ink px-4 py-3">
              <p className="text-xs font-bold text-fg/50">Campaign Brief</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-fg/80">
                {reviewTrunc(brief.trim())}
              </p>
            </div>
            <div className="rounded-xl border border-fg/10 bg-ink px-4 py-3">
              <p className="text-xs font-bold text-fg/50">Video Requirements</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-fg/80">
                {reviewTrunc(requirements.trim())}
              </p>
            </div>
          </div>
          {reviewHasUnset && (
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-200">
              <input
                type="checkbox"
                checked={ackUnset}
                onChange={(e) => setAckUnset(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#C6FF00]"
              />
              I understand — submit anyway
            </label>
          )}
        </div>
      ) : (
        <>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label id="field-brandName" className="block text-sm font-bold text-fg">
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
        <ImageUploadField
          fieldId="field-logoUrl"
          label="Brand Logo"
          help="Required — upload your logo. It shows on your campaign card. PNG, JPG or WebP — max 2 MB."
          buttonLabel="Upload logo (PNG, JPG or WebP — max 2 MB)"
          file={logoFile}
          previewUrl={logoPreview}
          error={fieldErrors.logoUrl}
          disabled={busy}
          onPick={pickLogo}
        />
        <label id="field-title" className="block text-sm font-bold text-fg">
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
        <label id="field-category" className="block text-sm font-bold text-fg">
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
        <div
          id="field-platforms"
          className="block text-sm font-bold text-fg md:col-span-2"
        >
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
        {/* Single rate (item 2): ONE rate for the whole campaign —
            the same rate applies to TikTok, Instagram and YouTube
            equally. */}
        <label id="field-rate" className="block text-sm font-bold text-fg">
          Rate Per 1000 Views (Your Choice)
          <span className="mt-1 block text-xs font-medium text-fg/50">
            One rate for all platforms — the same rate applies to
            TikTok, Instagram and YouTube. Must be more than $0.
            Higher rate = more creators will join fast.
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 2"
            className={inputCls}
          />
          {fieldErrors.rate && (
            <span className={errCls}>{fieldErrors.rate}</span>
          )}
        </label>
        <label id="field-budget" className="block text-sm font-bold text-fg">
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
        <label id="field-maxPayout" className="block text-sm font-bold text-fg md:col-span-2">
          Max Payout Per Post (USD)
          <input
            type="number"
            min={MAX_PAYOUT_MIN}
            max={MAX_PAYOUT_MAX}
            step="1"
            value={maxPayout}
            onChange={(e) => setMaxPayout(e.target.value)}
            placeholder="100"
            className={inputCls}
          />
          <span className="mt-1 block text-xs font-medium leading-relaxed text-fg/50">
            Creator will never earn more than this on one post, even if
            views are higher. Example: at {fmtChoice(capExampleRate)} per
            1k views, a video with 100k views would earn{" "}
            {fmtChoice(capExample.uncapped)}
            {capExample.capped ? (
              <>
                {" "}— capped at {fmtChoice(capExampleCap)}, so it earns{" "}
                {fmtChoice(capExample.earnings)}.
              </>
            ) : (
              <>.</>
            )}{" "}
            Range ${MAX_PAYOUT_MIN}–${MAX_PAYOUT_MAX}.
          </span>
          {fieldErrors.maxPayout && (
            <span className={errCls}>{fieldErrors.maxPayout}</span>
          )}
        </label>
        <label id="field-minViews" className="block text-sm font-bold text-fg">
          Minimum views per clip{" "}
          <span className="font-medium text-fg/50">(optional)</span>
          <input
            type="number"
            min={1000}
            step="1"
            value={minViews}
            onChange={(e) => setMinViews(e.target.value)}
            placeholder="e.g. 1000"
            className={inputCls}
          />
          <span className="mt-1 block text-xs font-medium leading-relaxed text-fg/50">
            Optional — leave blank for the 1,000 minimum. Every clip
            needs at least 1,000 views to earn.
          </span>
          {fieldErrors.minViews && (
            <span className={errCls}>{fieldErrors.minViews}</span>
          )}
        </label>
        <label id="field-duration" className="block text-sm font-bold text-fg md:col-span-2">
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
      </div>
      {/* Live calculation example — updates as the brand types. The
          views figure is an estimate from the single rate (the same
          rate applies on every platform). */}
      <div className="mt-4 rounded-2xl bg-lime/10 px-4 py-3 text-sm font-semibold leading-relaxed text-lime">
        Example (estimate, at{" "}
        {fmtChoice(Math.round(exampleRate * 100) / 100)} per 1k on all
        platforms): If you set a budget of{" "}
        {fmtChoice(exampleBudget)}, you will get approx{" "}
        {exampleViews.toLocaleString("en-US")} views. Budget{" "}
        {fmtChoice(exampleBudget)} + Platform fee (15%):{" "}
        {fmtChoice(exampleFee)} = Total to send{" "}
        {fmtChoice(exampleTotal)} · Creators pool (full budget):{" "}
        {fmtChoice(exampleBudget)}.
      </div>
      {/* Bottom of the form, in order (item 5): Campaign Brief →
          Video Requirements → Google Drive Link → Thumbnail. */}
      <label id="field-brief" className="mt-4 block text-sm font-bold text-fg">
        Campaign Brief
        <span className="mt-1 block text-xs font-medium text-fg/50">
          The content instructions for creators: what the content
          should be for, who to tag, the hook, and the CTA. Write it in
          four short parts: What to show · What NOT to show · Hook ·
          CTA. Creators read this before they film.
        </span>
        <textarea
          rows={7}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder={`Example — write your brief in four short parts:

What to show: [Brand] is a [one-line product intro]. Show the product in real use, the result it gives, and your honest reaction.

What NOT to show: No competitor logos, no misleading claims, no adult or unsafe content, no reused clips from other creators.

Hook: Open with the problem in the first 3 seconds — e.g. "Stop wasting money on..." — then show the fix.

CTA: End by telling viewers to try [Brand] — link in bio, or use code CLIP10 for 10% off.`}
          className={`${inputCls} resize-none`}
        />
        {fieldErrors.brief && (
          <span className={errCls}>{fieldErrors.brief}</span>
        )}
      </label>
      <label id="field-requirements" className="mt-4 block text-sm font-bold text-fg">
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
      <label id="field-driveUrl" className="mt-4 block text-sm font-bold text-fg">
        Google Drive Link
        <span className="mt-1 block text-xs font-medium text-fg/50">
          Required — paste the Drive link with your videos, logos and
          assets for creators. The content lives in Drive, so creators
          need this link to make their clips.
        </span>
        <input
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
          placeholder="https://drive.google.com/..."
          inputMode="url"
          className={inputCls}
        />
        {fieldErrors.driveUrl && (
          <span className={errCls}>{fieldErrors.driveUrl}</span>
        )}
      </label>
      <div className="mt-4">
        <ImageUploadField
          fieldId="field-thumbnailUrl"
          label="Thumbnail"
          help="Required — upload a banner image for your campaign. PNG, JPG or WebP — max 2 MB."
          buttonLabel="Upload thumbnail (PNG, JPG or WebP — max 2 MB)"
          file={thumbnailFile}
          previewUrl={thumbnailPreview}
          error={fieldErrors.thumbnailUrl}
          disabled={busy}
          onPick={pickThumbnail}
        />
      </div>
        </>
      )}
      {reviewing ? (
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="submit"
            disabled={busy || (reviewHasUnset && !ackUnset)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <>
                <Spinner /> Loading...
              </>
            ) : (
              "Submit campaign for review"
            )}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setReviewing(false)}
            className="flex w-full items-center justify-center rounded-full border border-fg/15 bg-ink py-3.5 text-sm font-bold text-fg transition hover:border-fg/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back to edit
          </button>
        </div>
      ) : (
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
      )}
      <p className="mt-3 text-center text-xs text-fg/40">
        No payment is taken here. After you submit, send your budget
        plus the 15% platform fee in USDT (TRC20) to the admin wallet
        on the payment page — your campaign goes live once the admin
        verifies your payment.
      </p>
      <p className="mt-2 text-center text-xs text-fg/40">
        <Link href="/rules" className="font-bold text-lime hover:underline">
          Read the full platform rules →
        </Link>
      </p>
    </form>
  );
}
