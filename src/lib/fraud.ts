// Bot-view rejection ladder (P1-c, Turn's decisions 2026-11-09,
// Content Rewards model: a flag pauses things for a human to
// decide, botting = permanent ban with one appeal).
//
// Counted per creator (user_id) across ALL campaigns, from
// submissions with rejection_reason exactly 'bot views' (the fixed
// value from P0 batch 3, REJECTION_REASONS in AdminReviewList).
// "other: <note>" never counts — only the exact 'bot views' value.
//
//   6 bot rejections  -> CONCERN: owner alerted, watch the creator.
//   10 bot rejections -> FLAG: owner alerted; one more = auto-ban.
//   11 bot rejections -> AUTO-BAN immediately (users.is_blocked =
//     true — the SAME mechanism as POST /api/admin/block; blocked
//     accounts cannot log in, submit, or withdraw). A flagged
//     creator is NOT banned at 10, only at the next bot rejection.
//
// The live count is the source of truth and always comes from the
// submissions table (getCreatorBotRejections). The creator_flags
// table (migration 0026) stores only the flag STATE (flagged_at /
// banned_at) plus the count as of the last processed rejection.

import type { SupabaseClient } from "@supabase/supabase-js";
import { adminMention, notifyDiscord } from "./notify";

/** The exact stored rejection_reason value that counts. */
export const BOT_REJECTION_REASON = "bot views";

/** Bot rejections at which the creator becomes a concern. */
export const BOT_CONCERN_THRESHOLD = 6;
/** Bot rejections at which the creator is flagged. */
export const BOT_FLAG_THRESHOLD = 10;
/** Bot rejections at which the creator is auto-banned (one more
 *  bot rejection after the flag). */
export const BOT_AUTO_BAN_COUNT = 11;

export type FraudStatus = "ok" | "concern" | "flagged" | "banned";

/** Status label for a creator, from their live bot count. */
export function fraudStatus(
  botRejections: number,
  isBlocked: boolean
): FraudStatus {
  if (isBlocked) return "banned";
  if (botRejections >= BOT_FLAG_THRESHOLD) return "flagged";
  if (botRejections >= BOT_CONCERN_THRESHOLD) return "concern";
  return "ok";
}

export const FRAUD_STATUS_LABELS: Record<FraudStatus, string> = {
  ok: "OK",
  concern: "Concern",
  flagged: "Flagged",
  banned: "Banned",
};

const ADMIN_URL = "https://get-paid-to-post.vercel.app/admin";

function alertPrefix(): string {
  const mention = adminMention();
  return mention ? `${mention} ` : "";
}

export interface BotRejectionOutcome {
  count: number;
  outcome: "none" | "concern" | "flagged" | "auto-banned";
}

/**
 * Run AFTER a rejection with reason 'bot views' has been stored.
 * Counts the creator's total bot-view rejections (live, from the
 * submissions table), updates creator_flags, and fires the owner's
 * mobile alert (Discord webhook — fire-and-forget, same pattern as
 * the brand-payment notification) at 6 / 10 / 11.
 *
 * Never throws: a fraud-tracking failure must never break the
 * review request that already stored the rejection.
 */
export async function handleBotRejection(
  supabase: SupabaseClient,
  userId: string
): Promise<BotRejectionOutcome> {
  const none: BotRejectionOutcome = { count: 0, outcome: "none" };
  try {
    // Live count — the submissions table is the source of truth.
    const { count, error: countError } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "rejected")
      .eq("rejection_reason", BOT_REJECTION_REASON);
    if (countError || count == null) {
      console.error(
        "[fraud] could not count bot rejections for user",
        userId,
        countError?.message ?? ""
      );
      return none;
    }

    // Creator email for the alert (fall back to a short id).
    let email = userId.slice(0, 8);
    try {
      const { data: userRow } = await supabase
        .from("users")
        .select("email")
        .eq("id", userId)
        .single();
      if (userRow?.email) email = String(userRow.email);
    } catch {
      // Email lookup is best-effort; the alert still goes out.
    }

    const prefix = alertPrefix();
    let outcome: BotRejectionOutcome["outcome"] = "none";

    // Read the existing flag state so alerts fire once per crossing
    // (and a manually-unblocked creator re-bans on the next one).
    let flaggedAt: string | null = null;
    let bannedAt: string | null = null;
    try {
      const { data: flagRow } = await supabase
        .from("creator_flags")
        .select("flagged_at, banned_at")
        .eq("user_id", userId)
        .single();
      flaggedAt = (flagRow?.flagged_at as string | null) ?? null;
      bannedAt = (flagRow?.banned_at as string | null) ?? null;
    } catch {
      // Migration 0026 not run yet — thresholds still alert below,
      // the flag row just cannot be stored.
    }

    if (count >= BOT_AUTO_BAN_COUNT && !bannedAt) {
      // AUTO-BAN: reuse the existing block mechanism exactly —
      // users.is_blocked = true (same update as /api/admin/block).
      // Blocked accounts cannot log in, submit, or withdraw.
      const { error: blockError } = await supabase
        .from("users")
        .update({ is_blocked: true })
        .eq("id", userId);
      if (blockError) {
        console.error(
          "[fraud] auto-ban failed for user",
          userId,
          blockError.message
        );
        return { count, outcome: "none" };
      }
      outcome = "auto-banned";
      void notifyDiscord(
        `${prefix}⛔ Creator auto-banned — ${email} was banned after ${count} bot-view rejections. View: ${ADMIN_URL}`
      );
    } else if (count === BOT_FLAG_THRESHOLD && !flaggedAt) {
      outcome = "flagged";
      void notifyDiscord(
        `${prefix}🚩 Creator flagged — ${email} has 10 bot-view rejections. One more bot rejection will auto-ban them. View: ${ADMIN_URL}`
      );
    } else if (count === BOT_CONCERN_THRESHOLD) {
      outcome = "concern";
      void notifyDiscord(
        `${prefix}⚠️ Bot-view concern — ${email} has 6 bot-view rejections. Watch their next submissions. View: ${ADMIN_URL}`
      );
    }

    // Persist the flag state (best-effort — migration 0026 may
    // not be run yet; the live count in the admin view still works).
    try {
      await supabase.from("creator_flags").upsert(
        {
          user_id: userId,
          bot_rejections: count,
          flagged_at:
            flaggedAt ??
            (count >= BOT_FLAG_THRESHOLD
              ? new Date().toISOString()
              : null),
          banned_at:
            bannedAt ??
            (outcome === "auto-banned" ? new Date().toISOString() : null),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch (e) {
      console.error("[fraud] could not upsert creator_flags:", e);
    }

    return { count, outcome };
  } catch (e) {
    console.error("[fraud] handleBotRejection failed:", e);
    return none;
  }
}
