import { HOLD_HOURS, WITHDRAW_FEE_RATE } from "./constants";

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

/** 7% withdrawal fee. */
export function feeFor(amount: number): number {
  return Math.round(amount * WITHDRAW_FEE_RATE * 100) / 100;
}

/** Final payout after the 7% fee: amount × 0.93 */
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
