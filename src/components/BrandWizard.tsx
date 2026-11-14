"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import ImageUploadField from "@/components/ImageUploadField";
import {
  TikTokIcon,
  InstagramIcon,
  YouTubeIcon,
} from "@/components/PlatformIcons";

/**
 * Brand campaign creation wizard — Content-Rewards-style 8 steps,
 * our payment model:
 *
 * 1 Organization — name, website (optional), short description
 *   (optional). Saved to the brand's profile (PATCH /api/profile)
 *   when the brand taps Continue.
 * 2 Goal — one of Brand awareness / Drive sales / UGC library /
 *   Grow a community.
 * 3 Features — multi-select (Campaigns, Creators, Payouts,
 *   Analytics, Submissions, Discover, Retainers, Drafts).
 *   Informational only — the selection is stored, no feature is
 *   built behind it.
 * 4 Details — campaign name, description (300 chars), types
 *   (Clipping, UGC (With Face)), category, thumbnail 16:9 file
 *   upload (REQUIRED), reference links (Docs / Drive / Notion —
 *   at least one link), logo file upload
 *   (REQUIRED, as before).
 * 5 Requirements — brief, one rule per line; link-in-bio toggle;
 *   required sound — TikTok sound URL + Instagram Reel URL
 *   (optional).
 * 6 Configuration — visibility, Show on Discover, access type,
 *   platforms, pricing (budget + live 15% fee math, rate per 1k,
 *   min payout, max payout per post).
 * 7 Summary — a card of everything, then Save.
 * 8 Fund — after Save the campaign exists as status='pending';
 *   this screen shows budget + 15% fee + total in USDT (TRC20)
 *   and a button to the existing /brands/payment/[id] page. No
 *   payment is collected here.
 *
 * Money rules (exact, never changed): pay = views only, no base
 * pay; any budget > $0; one rate per 1,000 views; 15% platform
 * fee ON TOP of budget ($500 → $575 total, creators pool stays
 * $500); campaign goes live ONLY after the owner verifies funding
 * in his wallet — creation always saves status='pending'.
 * Uploads reuse the existing POST /api/campaigns/upload-image
 * (logo + thumbnail, PNG/JPG/WebP, max 2 MB, uploaded at Save).
 */

const STEPS = [
  "Organization",
  "Goal",
  "Features",
  "Details",
  "Requirements",
  "Configuration",
  "Summary",
  "Fund",
] as const;

const GOALS = [
  "Brand awareness",
  "Drive sales",
  "UGC library",
  "Grow a community",
] as const;

const FEATURES = [
  "Campaigns",
  "Creators",
  "Payouts",
  "Analytics",
  "Submissions",
  "Discover",
  "Retainers",
  "Drafts",
] as const;

const CAMPAIGN_TYPES = ["Clipping", "UGC (With Face)"] as const;

const DESCRIPTION_MAX = 300;

function isHttpUrl(raw: string): boolean {
  return /^https?:\/\/.+\..+/.test(raw.trim());
}

function linesOf(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export default function BrandWizard({
  isLoggedIn,
  initialBrandName,
  initialWebsite,
  initialBrandDescription,
}: {
  isLoggedIn: boolean;
  initialBrandName?: string | null;
  initialWebsite?: string | null;
  initialBrandDescription?: string | null;
}) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [submitStep, setSubmitStep] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Step 1 — Organization
  const [brandName, setBrandName] = useState(initialBrandName ?? "");
  const [website, setWebsite] = useState(initialWebsite ?? "");
  const [brandDescription, setBrandDescription] = useState(
    initialBrandDescription ?? ""
  );
  // Step 2 — Goal
  const [goal, setGoal] = useState<string>("");
  // Step 3 — Features
  const [features, setFeatures] = useState<string[]>([]);
  // Step 4 — Details
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [category, setCategory] = useState<string>("UGC");
  const [referenceLinks, setReferenceLinks] = useState("");
  // Links (Step 4) — Content-Rewards-style "Add links": tap the
  // button, paste a link, tap Add. A Drive link is just one kind of
  // link — there is no separate Drive field any more.
  const [linkInput, setLinkInput] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{
    logo?: { file: File; url: string };
    thumbnail?: { file: File; url: string };
  }>({});
  // Step 5 — Requirements
  const [brief, setBrief] = useState("");
  const [requireLinkInBio, setRequireLinkInBio] = useState(false);
  const [soundTiktok, setSoundTiktok] = useState("");
  const [soundInstagram, setSoundInstagram] = useState("");
  // Step 6 — Configuration
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [showOnDiscover, setShowOnDiscover] = useState(true);
  const [accessType, setAccessType] = useState<"open" | "application">("open");
  const [platforms, setPlatforms] = useState<Platform[]>(["tiktok"]);
  const [budget, setBudget] = useState("");
  const [rate, setRate] = useState("");
  const [minPayout, setMinPayout] = useState("");
  const [maxPayout, setMaxPayout] = useState("");
  const [minViews, setMinViews] = useState("");
  const [durationDays, setDurationDays] = useState("");

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
  useEffect(
    () => () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    },
    // Previews are only ever replaced through pickLogo /
    // pickThumbnail (which revoke the old one); cleanup on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function toggleIn(list: string[], value: string, set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }
  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  function fail(field: string, message: string) {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
    showError(message);
    requestAnimationFrame(() => {
      const el = document.getElementById(`field-${field}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = el?.querySelector(
        "input:not([type='file']), select, textarea, button"
      ) as HTMLElement | null;
      focusable?.focus({ preventScroll: true });
    });
  }

  // Links (Step 4) — add one pasted link at a time; links are
  // stored one per line in `referenceLinks` (the payload shape is
  // unchanged — POST /api/campaigns takes referenceLinks[]).
  function addLink() {
    const link = linkInput.trim();
    if (!link) {
      fail("referenceLinks", "Paste a link first, then tap Add.");
      return;
    }
    if (!isHttpUrl(link)) {
      fail("referenceLinks", "Link must start with http:// or https://");
      return;
    }
    const links = linesOf(referenceLinks);
    if (links.includes(link)) {
      fail("referenceLinks", "This link is already added.");
      return;
    }
    if (links.length >= 10) {
      fail("referenceLinks", "Add at most 10 reference links");
      return;
    }
    setReferenceLinks([...links, link].join("\n"));
    setLinkInput("");
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.referenceLinks;
      return next;
    });
  }

  function removeLink(link: string) {
    setReferenceLinks(
      linesOf(referenceLinks).filter((l) => l !== link).join("\n")
    );
  }

  // Per-step validation. Returns true when the step is good to
  // leave; on failure it shows the error and highlights the field.
  function validateStep(s: number): boolean {
    setFieldErrors({});
    if (s === 1) {
      if (!brandName.trim()) {
        fail("brandName", "Organization name is required");
        return false;
      }
      if (brandName.trim().length > 100) {
        fail("brandName", "Organization name must be 100 characters or less");
        return false;
      }
      if (website.trim() && !isHttpUrl(website)) {
        fail("website", "Website must be a valid link starting with http:// or https://");
        return false;
      }
      if (brandDescription.trim().length > 500) {
        fail("brandDescription", "Description must be 500 characters or less");
        return false;
      }
      return true;
    }
    if (s === 2) {
      if (!goal) {
        fail("goal", "Pick one goal for this campaign");
        return false;
      }
      return true;
    }
    // Step 3 (Features) is informational — no required pick.
    if (s === 4) {
      if (!title.trim()) {
        fail("title", "Campaign name is required");
        return false;
      }
      if (title.trim().length > 120) {
        fail("title", "Campaign name must be 120 characters or less");
        return false;
      }
      if (!description.trim()) {
        fail("description", "Campaign description is required");
        return false;
      }
      if (description.length > DESCRIPTION_MAX) {
        fail("description", `Description must be ${DESCRIPTION_MAX} characters or less`);
        return false;
      }
      if (types.length === 0) {
        fail("types", "Pick at least one campaign type — Clipping or UGC (With Face)");
        return false;
      }
      if (!isCampaignCategory(category)) {
        fail("category", `Category must be one of ${CAMPAIGN_CATEGORIES.join(", ")}.`);
        return false;
      }
      const links = linesOf(referenceLinks);
      if (links.length === 0) {
        fail(
          "referenceLinks",
          "Add at least one link — Google Docs, Drive, YouTube, Spotify, TikTok, Notion, or any link for creators to reference"
        );
        return false;
      }
      if (links.length > 10) {
        fail("referenceLinks", "Add at most 10 reference links");
        return false;
      }
      for (const link of links) {
        if (!isHttpUrl(link)) {
          fail("referenceLinks", `Reference link must start with http:// or https:// — "${link.slice(0, 60)}"`);
          return false;
        }
      }
      if (!logoFile) {
        fail("logoUrl", "Brand Logo is required — upload your logo image.");
        return false;
      }
      if (!thumbnailFile) {
        fail("thumbnailUrl", "Thumbnail is required — upload a banner image (16:9).");
        return false;
      }
      return true;
    }
    if (s === 5) {
      if (linesOf(brief).length === 0) {
        fail("brief", "Write at least one rule — one rule per line");
        return false;
      }
      if (brief.length > 5000) {
        fail("brief", "Brief must be 5,000 characters or less");
        return false;
      }
      if (soundTiktok.trim() && !isHttpUrl(soundTiktok)) {
        fail("soundTiktok", "TikTok sound link must start with http:// or https://");
        return false;
      }
      if (soundInstagram.trim() && !isHttpUrl(soundInstagram)) {
        fail("soundInstagram", "Instagram Reel link must start with http:// or https://");
        return false;
      }
      return true;
    }
    if (s === 6) {
      if (platforms.length === 0) {
        fail("platforms", "Platforms: select at least one platform");
        return false;
      }
      const budgetNum = Number(budget);
      if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
        fail("budget", "Budget must be more than $0");
        return false;
      }
      if (budgetNum > 1_000_000) {
        fail("budget", "Budget must be $1,000,000 or less");
        return false;
      }
      const rateNum = Number(rate);
      if (!Number.isFinite(rateNum) || rateNum <= 0) {
        fail("rate", "Rate per 1,000 views must be more than $0 per 1k views");
        return false;
      }
      if (Math.round(rateNum * 100) / 100 > 1000) {
        fail("rate", "Rate per 1,000 views must be $1,000 or less per 1k views");
        return false;
      }
      if (Math.round(rateNum * 100) / 100 <= 0) {
        fail("rate", "Rate is too small — after rounding it is $0.00 per 1k views.");
        return false;
      }
      const capNum = maxPayout.trim() === "" ? MAX_PAYOUT_DEFAULT : Number(maxPayout);
      if (
        maxPayout.trim() !== "" &&
        (!Number.isFinite(capNum) || capNum < MAX_PAYOUT_MIN || capNum > MAX_PAYOUT_MAX)
      ) {
        fail("maxPayout", `Max Payout Per Post must be between $${MAX_PAYOUT_MIN} and $${MAX_PAYOUT_MAX}`);
        return false;
      }
      const minPayoutNum = minPayout.trim() === "" ? null : Number(minPayout);
      if (
        minPayoutNum !== null &&
        (!Number.isFinite(minPayoutNum) || minPayoutNum < 0 || minPayoutNum > MAX_PAYOUT_MAX)
      ) {
        fail("minPayout", `Min payout must be between $0 and $${MAX_PAYOUT_MAX}`);
        return false;
      }
      if (minPayoutNum !== null && minPayoutNum > capNum) {
        fail("minPayout", "Min payout cannot be more than Max payout per post");
        return false;
      }
      const minViewsNum = minViews.trim() === "" ? 1000 : Math.floor(Number(minViews));
      if (!Number.isFinite(minViewsNum) || minViewsNum < 1000) {
        fail("minViews", "Minimum views per clip must be at least 1,000");
        return false;
      }
      if (minViewsNum > 1_000_000) {
        fail("minViews", "Minimum views per clip must be 1,000,000 or less");
        return false;
      }
      return true;
    }
    return true;
  }

  // Step 1 saves the organization to the brand's profile, then
  // moves on. A failed save stays on step 1 with the real error.
  async function saveProfile(): Promise<boolean> {
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brandName.trim(),
          website: website.trim() || null,
          brandDescription: brandDescription.trim() || null,
        }),
      });
      const text = await res.text();
      let data: { error?: string } = {};
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        // Non-JSON body — fall through to the status message below.
      }
      if (!res.ok)
        throw new Error(data.error || `Server error (HTTP ${res.status}) — please try again.`);
      return true;
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not save your organization.");
      return false;
    }
  }

  async function handleContinue() {
    if (!isLoggedIn) {
      showError("Please log in or sign up first to create a campaign.");
      return;
    }
    if (!validateStep(step)) return;
    if (step === 1) {
      setBusy(true);
      try {
        if (!(await saveProfile())) return;
      } finally {
        setBusy(false);
      }
    }
    setStep((s) => Math.min(7, s + 1));
  }

  async function uploadImage(file: File, kind: "logo" | "thumbnail") {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const res = await fetch("/api/campaigns/upload-image", {
      method: "POST",
      body: form,
    });
    const text = await res.text();
    let data: { error?: string; url?: string } = {};
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      // Non-JSON body — fall through to the status message below.
    }
    if (!res.ok)
      throw new Error(data.error || `Server error (HTTP ${res.status}) — please try again.`);
    return String(data.url ?? "");
  }

  async function uploadImageReuse(file: File, kind: "logo" | "thumbnail"): Promise<string> {
    const prev = uploaded[kind];
    if (prev && prev.file === file && prev.url) return prev.url;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = await uploadImage(file, kind);
        setUploaded((u) => ({ ...u, [kind]: { file, url } }));
        return url;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error("Could not upload the image.");
      }
    }
    throw lastErr ?? new Error("Could not upload the image.");
  }

  function friendlySubmitError(err: unknown): string {
    const msg = err instanceof Error ? err.message : "";
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
      return "Connection failed — check your internet connection and try again. Your entries are still on this page — tap Save again (don't refresh).";
    }
    return msg || "Could not save the campaign.";
  }

  function serverErrorField(message: string): string | null {
    const m = message.toLowerCase();
    if (m.includes("organization name") || m.includes("brand name")) return "brandName";
    if (m.includes("brand logo")) return "logoUrl";
    if (m.includes("campaign title") || m.includes("campaign name")) return "title";
    if (m.includes("category")) return "category";
    if (m.includes("campaign brief") || m.includes("video requirements") || m.includes("at least one rule")) return "brief";
    if (m.includes("select at least one platform")) return "platforms";
    if (m.includes("max payout")) return "maxPayout";
    if (m.includes("min payout")) return "minPayout";
    if (m.includes("minimum views")) return "minViews";
    if (m.includes("rate")) return "rate";
    if (m.includes("budget")) return "budget";
    if (m.includes("reference link")) return "referenceLinks";
    if (m.includes("thumbnail")) return "thumbnailUrl";
    if (m.includes("goal")) return "goal";
    return null;
  }

  // Step 7 Save: re-validates every step, uploads logo +
  // thumbnail, then creates the real campaign row (status
  // 'pending'). On success the wizard moves to step 8 (Fund).
  async function saveCampaign() {
    if (!isLoggedIn) {
      showError("Please log in or sign up first to submit a campaign.");
      return;
    }
    for (const s of [1, 2, 4, 5, 6]) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }
    const logo = logoFile;
    const thumbnail = thumbnailFile;
    if (!logo || !thumbnail) {
      showError("Brand Logo and Thumbnail are both required.");
      setStep(4);
      return;
    }
    const budgetNum = Number(budget);
    const rateNum = Number(rate);
    const capNum = maxPayout.trim() === "" ? MAX_PAYOUT_DEFAULT : Number(maxPayout);
    const minViewsNum = minViews.trim() === "" ? 1000 : Math.floor(Number(minViews));
    const briefLines = linesOf(brief);
    setBusy(true);
    try {
      setSubmitStep("Uploading logo…");
      const logoUrl = await uploadImageReuse(logo, "logo");
      setSubmitStep("Uploading thumbnail…");
      const thumbnailUrl = await uploadImageReuse(thumbnail, "thumbnail");
      setSubmitStep("Saving campaign…");
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brandName.trim(),
          logoUrl,
          title: title.trim(),
          category,
          platforms,
          platform: platforms.length === 3 ? "all" : platforms[0],
          rates: Object.fromEntries(platforms.map((p) => [p, rateNum])),
          ratePer1k: rateNum,
          minViews: minViewsNum,
          budgetTotal: budgetNum,
          maxPayoutPerPost: capNum,
          minPayout: minPayout.trim() === "" ? null : Number(minPayout),
          description: description.trim(),
          requirements: briefLines.join("\n"),
          briefLines,
          referenceLinks: linesOf(referenceLinks),
          thumbnailUrl,
          durationDays: durationDays === "" ? null : Number(durationDays),
          goal,
          features,
          types,
          requireLinkInBio,
          requiredSoundTiktok: soundTiktok.trim() || null,
          requiredSoundInstagram: soundInstagram.trim() || null,
          visibility,
          showOnDiscover,
          accessType,
        }),
      });
      const text = await res.text();
      let data: {
        id?: string;
        error?: string;
        existingUnpaidPending?: { id: string; title: string } | null;
      } = {};
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        // Non-JSON body — fall through to the status message below.
      }
      if (!res.ok)
        throw new Error(data.error || `Server error (HTTP ${res.status}) — please try again.`);
      showSuccess(
        data.existingUnpaidPending
          ? `Campaign saved as pending. Now send your budget plus the 15% fee on the payment page — your campaign goes live only after the admin verifies your payment. Note: you already have an unpaid pending campaign ("${data.existingUnpaidPending.title}") — fund it first from your dashboard.`
          : "Campaign saved as pending. Now send your budget plus the 15% fee on the payment page — your campaign goes live only after the admin verifies your payment."
      );
      if (data.id) {
        setCreatedId(data.id);
        setStep(8);
      }
    } catch (err) {
      const msg = friendlySubmitError(err);
      const field = serverErrorField(msg);
      if (field) {
        const stepFor: Record<string, number> = {
          brandName: 1, logoUrl: 4, title: 4, category: 4, brief: 5,
          platforms: 6, maxPayout: 6, minPayout: 6, minViews: 6,
          rate: 6, budget: 6, referenceLinks: 4, thumbnailUrl: 4, goal: 2,
        };
        setStep(stepFor[field] ?? 7);
        fail(field, msg);
      } else {
        showError(msg);
      }
    } finally {
      setBusy(false);
      setSubmitStep(null);
    }
  }

  const inputCls =
    "mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-sm text-fg outline-none placeholder:text-fg/30 focus:border-lime";
  const errCls = "mt-1 block text-sm font-bold text-red-300";
  const labelCls = "block text-sm font-bold text-fg";
  const helpCls = "mt-1 block text-xs font-medium leading-relaxed text-fg/50";
  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Live fee math (step 6 + summary + fund): 15% ON TOP of budget.
  const budgetNum = Number(budget);
  const budgetValid = Number.isFinite(budgetNum) && budgetNum > 0;
  const fee = budgetValid ? platformFeeFor(budgetNum) : 0;
  const total = budgetValid ? totalToSend(budgetNum) : 0;
  const rateNum = Number(rate);
  const capNum = maxPayout.trim() === "" ? MAX_PAYOUT_DEFAULT : Number(maxPayout);
  const briefLines = linesOf(brief);
  const referenceLines = linesOf(referenceLinks);
  const platformName = (p: Platform) =>
    p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "YouTube";

  function chip(
    selected: boolean,
    onClick: () => void,
    children: React.ReactNode,
    key: string
  ) {
    return (
      <button
        key={key}
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`rounded-full border px-3.5 py-2 text-sm font-bold transition ${
          selected
            ? "border-lime/60 bg-lime/10 text-limeink"
            : "border-fg/15 bg-ink text-fg/70 hover:border-fg/30"
        }`}
      >
        {children}
      </button>
    );
  }

  function optionCard(
    selected: boolean,
    onClick: () => void,
    title: string,
    desc: string,
    key: string
  ) {
    return (
      <button
        key={key}
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`rounded-2xl border p-4 text-left transition ${
          selected
            ? "border-lime/60 bg-lime/10"
            : "border-fg/15 bg-ink hover:border-fg/30"
        }`}
      >
        <span className="flex items-center gap-2 text-sm font-extrabold text-fg">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
              selected ? "border-lime bg-lime text-ink" : "border-fg/30 text-transparent"
            }`}
          >
            ✓
          </span>
          {title}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-fg/60">{desc}</span>
      </button>
    );
  }

  function toggleRow(
    checked: boolean,
    onChange: (v: boolean) => void,
    title: string,
    desc: string
  ) {
    return (
      <label className="flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-fg/15 bg-ink px-4 py-3">
        <span>
          <span className="block text-sm font-bold text-fg">{title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-fg/50">{desc}</span>
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[#C6FF00]"
        />
      </label>
    );
  }

  // ---- Step bodies ----
  const stepBody: Record<number, React.ReactNode> = {
    1: (
      <div className="grid gap-4">
        <p className="text-sm leading-relaxed text-fg/60">
          Tell creators who you are. Your organization name shows on
          every campaign card; your website and description are saved
          to your brand profile.
        </p>
        <label id="field-brandName" className={labelCls}>
          Organization name *
          <input
            value={brandName}
            maxLength={100}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Your brand"
            className={inputCls}
          />
          {fieldErrors.brandName && <span className={errCls}>{fieldErrors.brandName}</span>}
        </label>
        <label id="field-website" className={labelCls}>
          Website <span className="font-medium text-fg/50">(optional)</span>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yourbrand.com"
            inputMode="url"
            className={inputCls}
          />
          {fieldErrors.website && <span className={errCls}>{fieldErrors.website}</span>}
        </label>
        <label id="field-brandDescription" className={labelCls}>
          Short description <span className="font-medium text-fg/50">(optional)</span>
          <textarea
            rows={3}
            value={brandDescription}
            maxLength={500}
            onChange={(e) => setBrandDescription(e.target.value)}
            placeholder="What does your brand do, in one or two lines?"
            className={`${inputCls} resize-none`}
          />
          {fieldErrors.brandDescription && (
            <span className={errCls}>{fieldErrors.brandDescription}</span>
          )}
        </label>
      </div>
    ),
    2: (
      <div className="grid gap-3">
        <p className="text-sm leading-relaxed text-fg/60">
          What should this campaign achieve? Pick one — it helps
          creators understand what you want from their clips.
        </p>
        <div id="field-goal" className="grid gap-2 sm:grid-cols-2">
          {GOALS.map((g) =>
            optionCard(
              goal === g,
              () => setGoal(g),
              g,
              g === "Brand awareness"
                ? "Get your name in front of new audiences."
                : g === "Drive sales"
                  ? "Turn views into orders and signups."
                  : g === "UGC library"
                    ? "Collect real creator videos to reuse."
                    : "Grow followers and a community around your brand.",
              g
            )
          )}
        </div>
        {fieldErrors.goal && <span className={errCls}>{fieldErrors.goal}</span>}
      </div>
    ),
    3: (
      <div className="grid gap-3">
        <p className="text-sm leading-relaxed text-fg/60">
          Which parts of the platform interest you? Pick any — this
          is just to understand what you need. Nothing extra is
          built or charged for a pick.
        </p>
        <div className="flex flex-wrap gap-2">
          {FEATURES.map((f) =>
            chip(features.includes(f), () => toggleIn(features, f, setFeatures), f, f)
          )}
        </div>
        {features.length > 0 && (
          <p className="text-xs text-fg/50">
            Selected: {features.join(", ")}
          </p>
        )}
      </div>
    ),
    4: (
      <div className="grid gap-4">
        <label id="field-title" className={labelCls}>
          Campaign name *
          <input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Show Your Energy"
            className={inputCls}
          />
          {fieldErrors.title && <span className={errCls}>{fieldErrors.title}</span>}
        </label>
        <label id="field-description" className={labelCls}>
          Campaign description *
          <textarea
            rows={4}
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this campaign about? Creators read this before they film."
            className={`${inputCls} resize-none`}
          />
          <span className="mt-1 flex justify-between text-xs font-medium text-fg/50">
            <span>Short and clear — what should creators make?</span>
            <span className={description.length >= DESCRIPTION_MAX ? "font-bold text-amber-300" : ""}>
              {description.length}/{DESCRIPTION_MAX}
            </span>
          </span>
          {fieldErrors.description && <span className={errCls}>{fieldErrors.description}</span>}
        </label>
        <div id="field-types" className={labelCls}>
          Campaign types *
          <span className={helpCls}>Pick at least one.</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {CAMPAIGN_TYPES.map((t) =>
              chip(types.includes(t), () => toggleIn(types, t, setTypes), t, t)
            )}
          </div>
          {fieldErrors.types && <span className={errCls}>{fieldErrors.types}</span>}
        </div>
        <label id="field-category" className={labelCls}>
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
          <span className={helpCls}>Creators browse campaigns by category.</span>
          {fieldErrors.category && <span className={errCls}>{fieldErrors.category}</span>}
        </label>
        <div id="field-referenceLinks" className={labelCls}>
          Links *
          <span className={helpCls}>
            Add links (Google Docs, Drive, YouTube, Spotify, TikTok,
            Notion, or any link) for creators to reference. At least
            one link is required — a Drive link on its own is not
            needed, any link works.
          </span>
          <div className="mt-2 grid gap-2">
            {referenceLines.map((link) => (
              <div
                key={link}
                className="flex items-center gap-2 rounded-xl border border-fg/15 bg-fg/5 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                  {link}
                </span>
                <button
                  type="button"
                  onClick={() => removeLink(link)}
                  disabled={busy}
                  aria-label={`Remove ${link}`}
                  className="shrink-0 rounded-full border border-fg/20 px-2 py-1 text-xs font-bold text-fg/70 hover:text-fg disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            ))}
            {showLinkInput ? (
              <div className="flex gap-2">
                <input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLink();
                    }
                  }}
                  placeholder="https:// — paste a link, then tap Add"
                  inputMode="url"
                  className={`${inputCls} min-w-0 flex-1`}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={addLink}
                  disabled={busy}
                  className="shrink-0 rounded-full bg-lime px-4 py-2 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowLinkInput(true)}
                disabled={busy}
                className="flex items-center gap-3 rounded-xl border border-fg/15 bg-fg/5 px-4 py-3 text-left transition hover:border-fg/30 disabled:opacity-40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fg/10 text-base font-black text-fg">
                  🔗
                </span>
                <span>
                  <span className="block text-sm font-bold text-fg">
                    Add links
                  </span>
                  <span className="block text-xs font-medium text-fg/50">
                    Google Docs, Drive, Notion, and other links
                  </span>
                </span>
              </button>
            )}
            <span className="text-xs font-medium text-fg/50">
              {referenceLines.length > 0
                ? `${referenceLines.length} link${referenceLines.length === 1 ? "" : "s"} added`
                : "No links yet — add at least one."}
            </span>
          </div>
          {fieldErrors.referenceLinks && (
            <span className={errCls}>{fieldErrors.referenceLinks}</span>
          )}
        </div>
        <ImageUploadField
          fieldId="field-logoUrl"
          label="Brand Logo"
          help="Required — upload your logo. It shows on your campaign card. PNG, JPG or WebP — max 2 MB. Large phone photos are compressed automatically before upload."
          buttonLabel="Upload logo (PNG, JPG or WebP — max 2 MB)"
          file={logoFile}
          previewUrl={logoPreview}
          error={fieldErrors.logoUrl}
          disabled={busy}
          onPick={pickLogo}
        />
        <ImageUploadField
          fieldId="field-thumbnailUrl"
          label="Thumbnail (16:9)"
          help="Required — upload a banner image for your campaign. Wide 16:9 works best. PNG, JPG or WebP — max 2 MB. Large phone photos are compressed automatically before upload."
          buttonLabel="Upload thumbnail (PNG, JPG or WebP — max 2 MB)"
          file={thumbnailFile}
          previewUrl={thumbnailPreview}
          error={fieldErrors.thumbnailUrl}
          disabled={busy}
          onPick={pickThumbnail}
        />
      </div>
    ),
    5: (
      <div className="grid gap-4">
        <label id="field-brief" className={labelCls}>
          Brief — one rule per line *
          <span className={helpCls}>
            Each non-empty line becomes one rule creators must follow.
            Cover format, hook, what must appear, and what is not
            allowed. Creators read these before they film.
          </span>
          <textarea
            rows={6}
            value={brief}
            maxLength={5000}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={"Hook in the first 3 seconds.\nShow the product clearly in the first 5 seconds.\nVertical 9:16, captions on screen.\nNo competitor logos.\nEnd with the CTA: try [Brand] today."}
            className={`${inputCls} resize-none`}
          />
          <span className="mt-1 block text-xs font-medium text-fg/50">
            {briefLines.length > 0
              ? `${briefLines.length} rule${briefLines.length === 1 ? "" : "s"} so far`
              : "No rules yet — write at least one."}
          </span>
          {fieldErrors.brief && <span className={errCls}>{fieldErrors.brief}</span>}
        </label>
        {toggleRow(
          requireLinkInBio,
          setRequireLinkInBio,
          "Ask creators to add a link in bio",
          "Creators put your link in their profile bio while the campaign runs."
        )}
        <label id="field-soundTiktok" className={labelCls}>
          Required sound — TikTok{" "}
          <span className="font-medium text-fg/50">(optional)</span>
          <input
            value={soundTiktok}
            onChange={(e) => setSoundTiktok(e.target.value)}
            placeholder="https://www.tiktok.com/music/..."
            inputMode="url"
            className={inputCls}
          />
          {fieldErrors.soundTiktok && <span className={errCls}>{fieldErrors.soundTiktok}</span>}
        </label>
        <label id="field-soundInstagram" className={labelCls}>
          Required sound — Instagram Reel{" "}
          <span className="font-medium text-fg/50">(optional)</span>
          <input
            value={soundInstagram}
            onChange={(e) => setSoundInstagram(e.target.value)}
            placeholder="https://www.instagram.com/reel/..."
            inputMode="url"
            className={inputCls}
          />
          {fieldErrors.soundInstagram && (
            <span className={errCls}>{fieldErrors.soundInstagram}</span>
          )}
        </label>
        <p className="rounded-xl bg-ink px-4 py-3 text-xs leading-relaxed text-fg/60">
          Every clip must be submitted within 30 minutes of posting,
          needs at least 1% engagement (likes + comments), and a
          creator can have at most 15 approved clips per platform on
          this campaign. Fake engagement means the account is blocked.
        </p>
      </div>
    ),
    6: (
      <div className="grid gap-4">
        <div className={labelCls}>
          Visibility
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {optionCard(
              visibility === "public",
              () => setVisibility("public"),
              "Public",
              "Anyone can find this campaign.",
              "public"
            )}
            {optionCard(
              visibility === "private",
              () => setVisibility("private"),
              "Private",
              "Hidden from public lists — only people with the link see it.",
              "private"
            )}
          </div>
        </div>
        {toggleRow(
          showOnDiscover,
          setShowOnDiscover,
          "Show on Discover",
          "List this campaign on the Discover page so creators can find and join it."
        )}
        <div className={labelCls}>
          Access
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {optionCard(
              accessType === "open",
              () => setAccessType("open"),
              "Open to public",
              "Any creator can post and submit clips.",
              "open"
            )}
            {optionCard(
              accessType === "application",
              () => setAccessType("application"),
              "Application only",
              "Creators apply first — you choose who posts.",
              "application"
            )}
          </div>
          {accessType === "application" && (
            <p className="mt-2 text-xs leading-relaxed text-fg/60">
              Note: creator applications are coming soon — until then,
              creators can still join this campaign directly, and you
              approve or reject each clip yourself.
            </p>
          )}
        </div>
        <div id="field-platforms" className={labelCls}>
          Platforms *
          <span className={helpCls}>Pick at least one.</span>
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
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition ${
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
          {fieldErrors.platforms && <span className={errCls}>{fieldErrors.platforms}</span>}
        </div>
        <label id="field-budget" className={labelCls}>
          Total Budget (USD) *
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-fg/50">
              $
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="200"
              className={`${inputCls} pl-8`}
            />
          </div>
          <span className={helpCls}>
            Any amount above $0 — you choose it. Creators are paid
            from this budget, funded upfront before launch.
          </span>
          {budgetValid && (
            <span className="mt-1 block rounded-xl bg-lime/10 px-3 py-2 text-xs font-bold leading-relaxed text-limeink">
              Budget {fmt(budgetNum)} + 15% platform fee {fmt(fee)} =
              Total to send {fmt(total)} · Creators pool (full budget):{" "}
              {fmt(budgetNum)}
            </span>
          )}
          {fieldErrors.budget && <span className={errCls}>{fieldErrors.budget}</span>}
        </label>
        <label id="field-rate" className={labelCls}>
          Rate per 1,000 views (USD) *
          <span className={helpCls}>
            How much ONE creator earns for every 1,000 views on their
            clip. The same rate applies on TikTok, Instagram and
            YouTube.
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-fg/50">
              $
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="2"
              className={`${inputCls} pl-8`}
            />
          </div>
          {fieldErrors.rate && <span className={errCls}>{fieldErrors.rate}</span>}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label id="field-minPayout" className={labelCls}>
            Min payout (USD){" "}
            <span className="font-medium text-fg/50">(optional)</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-fg/50">
                $
              </span>
              <input
                type="number"
                min={0}
                max={MAX_PAYOUT_MAX}
                step="0.01"
                value={minPayout}
                onChange={(e) => setMinPayout(e.target.value)}
                placeholder="1"
                className={`${inputCls} pl-8`}
              />
            </div>
            <span className={helpCls}>Blank = $1. Least a clip can earn.</span>
            {fieldErrors.minPayout && <span className={errCls}>{fieldErrors.minPayout}</span>}
          </label>
          <label id="field-maxPayout" className={labelCls}>
            Max payout per post (USD){" "}
            <span className="font-medium text-fg/50">(optional)</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-fg/50">
                $
              </span>
              <input
                type="number"
                min={MAX_PAYOUT_MIN}
                max={MAX_PAYOUT_MAX}
                step="1"
                value={maxPayout}
                onChange={(e) => setMaxPayout(e.target.value)}
                placeholder="100"
                className={`${inputCls} pl-8`}
              />
            </div>
            <span className={helpCls}>
              Blank = $100 default. Range ${MAX_PAYOUT_MIN}–${MAX_PAYOUT_MAX}.
            </span>
            {fieldErrors.maxPayout && <span className={errCls}>{fieldErrors.maxPayout}</span>}
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label id="field-minViews" className={labelCls}>
            Minimum views per clip{" "}
            <span className="font-medium text-fg/50">(optional)</span>
            <input
              type="number"
              min={1000}
              step="1"
              value={minViews}
              onChange={(e) => setMinViews(e.target.value)}
              placeholder="1000"
              className={inputCls}
            />
            <span className={helpCls}>Blank = 1,000 minimum. Never below 1,000.</span>
            {fieldErrors.minViews && <span className={errCls}>{fieldErrors.minViews}</span>}
          </label>
          <label id="field-duration" className={labelCls}>
            Duration <span className="font-medium text-fg/50">(optional)</span>
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
            <span className={helpCls}>
              Ends when the duration finishes or the budget runs out.
            </span>
          </label>
        </div>
        {budgetValid && Number.isFinite(rateNum) && rateNum > 0 && (
          <p className="rounded-2xl bg-lime/10 px-4 py-3 text-xs font-semibold leading-relaxed text-limeink">
            Estimate: at {fmt(Math.round(rateNum * 100) / 100)} per 1k views,
            a {fmt(budgetNum)} budget could pay for up to approx{" "}
            {Math.round((budgetNum / rateNum) * 1000).toLocaleString("en-US")}{" "}
            views. Views aren&apos;t guaranteed, and the per-post cap
            changes the total.
          </p>
        )}
      </div>
    ),
    7: (
      <div className="grid gap-2">
        <p className="text-sm leading-relaxed text-fg/60">
          Check everything below, then save. Your campaign is saved
          as pending — it goes live only after you fund it and the
          admin verifies your payment.
        </p>
        {(
          [
            ["Brand", brandName.trim()],
            ["Name", title.trim()],
            ["Payment model", "CPM — pay per 1,000 views"],
            ["Types", types.join(", ") || "—"],
            ["Category", category],
            ["Goal", goal || "—"],
            ["Features", features.join(", ") || "None selected"],
            ["Rate", Number.isFinite(rateNum) && rateNum > 0 ? `${fmt(rateNum)} per 1,000 views` : "—"],
            ["Budget", budgetValid ? `${fmt(budgetNum)} + 15% fee ${fmt(fee)} = ${fmt(total)} total` : "—"],
            ["Min payout", minPayout.trim() === "" ? "$1.00" : fmt(Number(minPayout))],
            ["Max payout per post", fmt(capNum)],
            ["Visibility", visibility === "public" ? "Public" : "Private"],
            ["Discover", showOnDiscover ? "Shown on Discover" : "Hidden from Discover"],
            ["Access", accessType === "open" ? "Open to public" : "Application only"],
            ["Platforms", platforms.map(platformName).join(", ")],
            ["Rules", `${briefLines.length} rule${briefLines.length === 1 ? "" : "s"}`],
            ["Link in bio", requireLinkInBio ? "Yes — creators add your link" : "No"],
            ["Reference links", `${referenceLines.length} link${referenceLines.length === 1 ? "" : "s"}`],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-3 rounded-xl border border-fg/10 bg-ink px-4 py-3"
          >
            <span className="shrink-0 text-xs font-bold text-fg/50">{label}</span>
            <span className="text-right text-sm font-semibold text-fg">{value}</span>
          </div>
        ))}
        <div className="rounded-xl border border-fg/10 bg-ink px-4 py-3">
          <p className="text-xs font-bold text-fg/50">Description</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-fg/80">{description.trim()}</p>
        </div>
        <div className="rounded-xl border border-fg/10 bg-ink px-4 py-3">
          <p className="text-xs font-bold text-fg/50">Rules</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-fg/80">
            {briefLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </div>
        <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-200">
          Unpaid pending campaigns expire after 7 days — send your
          payment within 7 days of saving. Chatting alone does not
          count as payment.
        </p>
      </div>
    ),
    8: (
      <div className="grid gap-4 text-center">
        <p className="text-4xl" aria-hidden>
          🎉
        </p>
        <h3 className="text-lg font-black text-fg">Campaign saved as pending</h3>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-fg/70">
          &ldquo;{title.trim()}&rdquo; is saved. It goes live only
          after you send your budget plus the 15% platform fee and
          the admin verifies your payment.
        </p>
        <div className="mx-auto w-full max-w-md rounded-2xl border border-fg/10 bg-ink p-4 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-fg/60">Budget (creators pool)</span>
            <span className="font-bold text-fg">{budgetValid ? fmt(budgetNum) : "—"}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-fg/60">Platform fee (15%)</span>
            <span className="font-bold text-fg">{budgetValid ? fmt(fee) : "—"}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-fg/10 pt-2 text-sm">
            <span className="font-bold text-fg">Total to send (USDT, TRC20)</span>
            <span className="font-black text-limeink">{budgetValid ? fmt(total) : "—"}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-fg/50">
            Send exactly this total in USDT on the TRON network
            (TRC20) from the payment page, then paste your
            Transaction ID there.
          </p>
        </div>
        <p className="mx-auto max-w-md text-xs leading-relaxed text-fg/50">
          No payment is taken here. Unpaid pending campaigns expire
          after 7 days.
        </p>
      </div>
    ),
  };

  if (!isLoggedIn) {
    return (
      <div className="rounded-3xl border border-fg/10 bg-card p-8 text-center">
        <p className="text-4xl" aria-hidden>
          🏢
        </p>
        <h2 className="mt-3 text-xl font-black text-fg">
          Create a brand account to launch a campaign
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
          Brands sign up with a brand name, email and password — then
          fill in the campaign wizard.
        </p>
        <Link
          href="/signup?role=brand"
          className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
        >
          Sign up as a brand
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-fg/10 bg-card p-4 sm:p-6">
      {/* Progress */}
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="text-fg">
          Step {step} of 8 — {STEPS[step - 1]}
        </span>
        <span className="text-fg/50">{Math.round((step / 8) * 100)}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-fg/10">
        <div
          className="h-full rounded-full bg-lime transition-all"
          style={{ width: `${(step / 8) * 100}%` }}
        />
      </div>
      <h2 className="mt-4 text-lg font-extrabold text-fg sm:text-xl">
        {step === 8 ? "Fund your campaign" : `Step ${step}: ${STEPS[step - 1]}`}
      </h2>

      <div className="mt-4">{stepBody[step]}</div>

      {/* Nav */}
      {step < 7 ? (
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            disabled={busy || step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="flex items-center justify-center rounded-full border border-fg/15 bg-ink px-5 py-3 text-sm font-bold text-fg transition hover:border-fg/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Back
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleContinue}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-lime py-3 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              "Continue →"
            )}
          </button>
        </div>
      ) : step === 7 ? (
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={saveCampaign}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <>
                <Spinner /> {submitStep ?? "Loading…"}
              </>
            ) : (
              "Save campaign"
            )}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setStep(6)}
            className="flex w-full items-center justify-center rounded-full border border-fg/15 bg-ink py-3.5 text-sm font-bold text-fg transition hover:border-fg/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Back to Configuration
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            disabled={!createdId}
            onClick={() => createdId && router.push(`/brands/payment/${createdId}`)}
            className="flex w-full items-center justify-center rounded-full bg-lime py-3.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
          >
            Go to payment page →
          </button>
          <Link
            href="/brands"
            className="flex w-full items-center justify-center rounded-full border border-fg/15 bg-ink py-3.5 text-sm font-bold text-fg transition hover:border-fg/30"
          >
            I&apos;ll fund it later
          </Link>
        </div>
      )}
      <p className="mt-3 text-center text-xs text-fg/40">
        No payment is taken here. After you save, send your budget
        plus the 15% platform fee in USDT (TRC20) on the payment page
        — your campaign goes live once the admin verifies your payment.
      </p>
      <p className="mt-2 text-center text-xs text-fg/40">
        <Link href="/rules" className="font-bold text-limeink hover:underline">
          Read the full platform rules →
        </Link>
      </p>
    </div>
  );
}
