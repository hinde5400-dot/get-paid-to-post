import { HOLD_HOURS, PLATFORM_FEE_RATE, WITHDRAW_FEE_RATE } from "./constants";

/** earnings = views / 1,000,000 × rate per 1M views */
export function earningsForViews(views: number, ratePer1m: number): number {
  return Math.round(((views / 1_000_000) * ratePer1m) * 100) / 100;
}

/**
 * Per-post payout with the campaign cap applied: a creator never earns
 * more than `cap` on one post, even if the views would pay more.
 * Example: 50,000 views at $2/1k = $100 uncapped; cap $75 → $75 earned.
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
 * Budget shown as % remaining only — never a $ amount on public
 * cards, modals or the detail page (Turn's decision, P0 batch 2).
 * The payment page is the one place that still shows $ amounts
 * (the fee split). 0 when there is no budget to divide by.
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
 * Budget-bar colour by % remaining: >50% green (lime), 25–50%
 * yellow, 10–25% red, <10% dark red. 0% remaining = campaign ended.
 */
export function budgetBarClass(remainingPct: number): string {
  if (remainingPct > 50) return "bg-lime";
  if (remainingPct >= 25) return "bg-yellow-400";
  if (remainingPct >= 10) return "bg-red-500";
  return "bg-red-800";
}

/** Final payout after the 5% fee: amount × 0.95 */
export function finalFor(amount: number): number {
  return Math.round((amount - feeFor(amount)) * 100) / 100;
}

export function formatUSD(n: number): string {
  return `$${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
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
  return `Ends in ${m}m`;
}
