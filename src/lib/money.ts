import { HOLD_HOURS, PLATFORM_FEE_RATE, WITHDRAW_FEE_RATE } from "./constants";

/** earnings = views / 1,000,000 × rate per 1M views */
export function earningsForViews(views: number, ratePer1m: number): number {
  return Math.round(((views / 1_000_000) * ratePer1m) * 100) / 100;
}

/**
 * Per-post payout with the campaign cap applied: a creator never earns
 * more than `cap` on one post, even if the views would pay more.
 * Example: 100,000 views at $2/1k = $200 uncapped; cap $100 → $100 earned.
 */
export function payoutForViews(
  views: number,
  ratePer1k: number,
  cap: number
): { uncapped: number; earnings: number; capped: boolean } {
  const uncapped = Math.round(((views / 1000) * ratePer1k) * 100) / 100;
  const earnings = Math.min(uncapped, cap);
  return { uncapped, earnings, capped: uncapped > cap };
}

/** 5% withdrawal fee. */
export function feeFor(amount: number): number {
  return Math.round(amount * WITHDRAW_FEE_RATE * 100) / 100;
}

/**
 * Platform fee (15% flat, charged ON TOP of the campaign budget):
 * the brand sends budget + fee, and the campaign runs on the full
 * budget — there is no reduced internal pool.
 */
export function platformFeeFor(budget: number): number {
  return Math.round(budget * PLATFORM_FEE_RATE * 100) / 100;
}

/** Total the brand sends: campaign budget + 15% platform fee. */
export function totalToSend(budget: number): number {
  return Math.round((budget + platformFeeFor(budget)) * 100) / 100;
}

/**
 * Budget shown as % USED only — never a $ amount on public
 * cards, modals or the detail page (Turn's decision, P0 batch 2;
 * flipped from % remaining 2026-11-10: the bar now FILLS as the
 * budget is used). The payment page is the one place that still
 * shows $ amounts (the fee split). 0 when there is no budget to
 * divide by (a campaign with no budget yet shows 0% used — never
 * 100% "ended").
 */
export function budgetUsedPct(
  budgetTotal: number,
  budgetLeft: number
): number {
  if (!budgetTotal || budgetTotal <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((1 - budgetLeft / budgetTotal) * 100))
  );
}

/**
 * Budget shown as % remaining — kept for the "Recommended" sort
 * (most budget remaining first = least used first) and for the
 * burn-rate math, which works off budget_left. Public UI uses
 * budgetUsedPct instead; never show a $ amount.
 */
export function budgetRemainingPct(
  budgetTotal: number,
  budgetLeft: number
): number {
  if (!budgetTotal || budgetTotal <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((budgetLeft / budgetTotal) * 100))
  );
}

/**
 * Budget-bar colour by % USED: <50% green (lime), 50–75% yellow,
 * 75–90% red, >90% dark red. 100% used = campaign ended (bar full,
 * dark red).
 */
export function budgetBarClass(usedPct: number): string {
  if (usedPct < 50) return "bg-lime";
  if (usedPct <= 75) return "bg-yellow-400";
  if (usedPct <= 90) return "bg-red-500";
  return "bg-red-800";
}

/** Final payout after the 5% fee: amount × 0.95 */
export function finalFor(amount: number): number {
  return Math.round((amount - feeFor(amount)) * 100) / 100;
}

/**
 * Rate display — SINGLE rate per 1,000 views for the whole
 * campaign (Turn's decision): the same rate on TikTok, Instagram
 * and YouTube. Legacy per-platform `rates` rows are ignored here
 * on purpose — no code path may surface a per-platform rate.
 */
export function rateRangeText(campaign: {
  view_bonus_per_1k: number;
}): string {
  return `${formatUSD(campaign.view_bonus_per_1k)} per 1k views`;
}

export function formatUSD(n: number): string {
  return `$${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 999_500) return "1.0M";
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function holdUntil(from: Date = new Date()): Date {
  return new Date(from.getTime() + HOLD_HOURS * 60 * 60 * 1000);
}

export function holdReleasedAt(holdUntilIso: string | null): Date | null {
  return holdUntilIso ? new Date(holdUntilIso) : null;
}

/**
 * Countdown text for a campaign end date: "Ends in 6d 4h",
 * "Ends in 3h 12m", "Ends in 9m", or "Ended" once it is past.
 * Returns null when there is no end date (runs until budget ends).
 */
export function formatTimeLeft(
  endsAt: string | null | undefined,
  now: number = Date.now()
): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return "Ended";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  if (d > 0) return `Ends in ${d}d ${h}h`;
  if (h > 0) return `Ends in ${h}h ${m}m`;
  if (m > 0) return `Ends in ${m}m`;
  return "Ends in <1m";
}

/**
 * Deadline as a plain date — "Ends 12 Nov 2026" when a deadline is
 * set and still ahead, "Ended 12 Nov 2026" once it has passed, or
 * "Open-ended" when the campaign runs until its budget ends.
 */
export function formatDeadline(
  endsAt: string | null | undefined,
  now: number = Date.now()
): string {
  if (!endsAt) return "Open-ended";
  const d = new Date(endsAt);
  // Explicit UTC so the date never shifts with the server's
  // local timezone (Vercel runs UTC; a viewer's day must not
  // depend on where the server happens to run).
  const date = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return d.getTime() <= now ? `Ended ${date}` : `Ends ${date}`;
}

/**
 * "Time left ~X days at current rate" (P1-a, Content Rewards model).
 *
 * FORMULA — burn rate first, deadline as the honest fallback:
 *   1. If the campaign has actually paid anything out AND has been
 *      running at least 1 day, daily burn = paid_out / days elapsed
 *      since started_at, and days left = budget_left / daily burn
 *      (rounded, min 0). Basis: "burn".
 *   2. Otherwise, if a deadline (ends_at) is set, days left =
 *      days until ends_at (rounded up, min 0). Basis: "deadline".
 *   3. Otherwise (open-ended, nothing paid out yet) there is no
 *      honest estimate — return null and the UI shows nothing
 *      instead of inventing a burn rate.
 * A burn rate is never invented from zero data: a campaign with no
 * payouts yet falls back to its deadline, or to null.
 */
export function budgetDaysLeft(
  campaign: {
    paid_out: number;
    budget_left: number;
    started_at?: string | null;
    ends_at?: string | null;
  },
  now: number = Date.now()
): { days: number; basis: "burn" | "deadline" } | null {
  const startedAt = campaign.started_at
    ? new Date(campaign.started_at).getTime()
    : NaN;
  if (
    campaign.paid_out > 0 &&
    Number.isFinite(startedAt) &&
    (now - startedAt) / 86400000 >= 1
  ) {
    const daysElapsed = (now - startedAt) / 86400000;
    const dailyBurn = campaign.paid_out / daysElapsed;
    if (dailyBurn > 0) {
      return {
        days: Math.max(0, Math.round(campaign.budget_left / dailyBurn)),
        basis: "burn",
      };
    }
  }
  if (campaign.ends_at) {
    const ms = new Date(campaign.ends_at).getTime() - now;
    if (ms > 0) {
      // Floored days, min 1 — matches the "Ends in 6d 4h"
      // countdown on the same page (a ceil here used to read
      // "~7 days left" next to "Ends in 6d 4h").
      return {
        days: Math.max(1, Math.floor(ms / 86400000)),
        basis: "deadline",
      };
    }
    return { days: 0, basis: "deadline" };
  }
  return null;
}

/** Display text for budgetDaysLeft: "~3 days left at current rate"
 *  (burn) or "~3 days left" (deadline fallback); null when there is
 *  no honest estimate. */
export function budgetTimeLeftText(
  campaign: {
    paid_out: number;
    budget_left: number;
    started_at?: string | null;
    ends_at?: string | null;
  },
  now: number = Date.now()
): string | null {
  const r = budgetDaysLeft(campaign, now);
  if (!r) return null;
  const label = r.days === 1 ? "day" : "days";
  return r.basis === "burn"
    ? `~${r.days} ${label} left at current rate`
    : `~${r.days} ${label} left`;
}
