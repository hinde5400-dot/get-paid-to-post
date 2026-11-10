// The 3-hour view refresh — shared by the scheduled job
// (/api/cron/refresh-views, called by GitHub Actions) and the owner's
// manual "Refresh views now" button (/api/admin/refresh-views).
//
// Rules:
// - Only PENDING submissions inside the 14-day tracking window are
//   refreshed (the SQL function lists them, stalest first).
// - A submission is skipped when it was refreshed < 3 hours ago —
//   that is the cadence Turn asked for ("har 3 hours bad views
//   refresh hon").
// - YouTube: public view count via the API key — but ONLY when
//   the video's channel matches the creator's CONNECTED YouTube
//   channel (Google OAuth, migration 0019). A link to someone
//   else's video is never counted: the refresh fails it with a
//   clear reason and the stored views stay untouched.
// - TikTok: the creator's own video via their saved (encrypted)
//   Login Kit tokens, refreshed when expired. A legacy plaintext
//   token is re-saved encrypted the first time it is used.
// - Instagram: NOT connected yet (no Meta app / API access — setup
//   paused at mobile verification), so those rows are skipped with
//   a clear reason instead of failing silently.
// - A refreshed number only ever updates the stored `views`,
//   `likes` and `comments` on a still-pending submission. The
//   like/comment counts feed the 1% engagement minimum
//   ((likes + comments) / views) checked at review time. Nothing
//   is approved and no earnings move here — the owner still
//   confirms the views on /admin.

import type { SupabaseClient } from "@supabase/supabase-js";
import { VIEW_REFRESH_MS } from "@/lib/constants";
import { fetchYouTubeVideoDetails } from "./youtube";
import { fetchTikTokViews, type TikTokTokens } from "./tiktok";
import { decryptToken, encryptToken, isEncryptedToken } from "./crypto";

export interface RefreshSummary {
  checked: number;
  updated: number;
  skipped: number;
  failed: number;
  byPlatform: Record<
    string,
    { updated: number; failed: number; skipped: number }
  >;
  errors: string[];
}

interface PendingRow {
  id: string;
  user_id: string;
  platform: string;
  post_url: string;
  views: number;
  likes: number;
  comments: number;
  views_refreshed_at: string | null;
}

interface TokenRow {
  user_id: string;
  open_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  refresh_expires_at: string | null;
}

interface YouTubeChannelRow {
  user_id: string;
  channel_id: string;
}

function fresh(summary: RefreshSummary): RefreshSummary {
  return summary;
}

export async function refreshPendingViews(
  supabase: SupabaseClient
): Promise<RefreshSummary> {
  const summary: RefreshSummary = {
    checked: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    byPlatform: {},
    errors: [],
  };
  const tally = (platform: string, key: "updated" | "failed" | "skipped") => {
    summary.byPlatform[platform] ??= { updated: 0, failed: 0, skipped: 0 };
    summary.byPlatform[platform][key] += 1;
  };

  // P2-8: stamp a failed/skipped attempt so the row stops crowding
  // out good rows. apply_view_refresh (migration 0022) sets
  // views_refreshed_at = now() even when the numbers are unchanged,
  // so re-saving the CURRENT values marks this row attempted and
  // the stalest-first list (limit 200) moves on to the next row
  // next run. Best-effort: a stamp failure is logged, never fatal.
  // (Not called when apply_view_refresh itself failed — stamping
  // through the same failing call would fail the same way, and a
  // row whose save persistently fails SHOULD stay at the front.)
  const stampAttempt = async (row: PendingRow) => {
    const { error } = await supabase.rpc("apply_view_refresh", {
      p_submission_id: row.id,
      p_views: row.views ?? 0,
      p_likes: row.likes ?? 0,
      p_comments: row.comments ?? 0,
    });
    if (error) {
      console.error(
        `[refresh] could not stamp attempt for ${row.id.slice(0, 8)}:`,
        error.message
      );
    }
  };

  const { data: rows, error: listError } = await supabase.rpc(
    "list_pending_submissions_for_refresh"
  );
  if (listError) {
    throw new Error(
      `Could not list pending submissions: ${listError.message}`
    );
  }
  const pending = (rows ?? []) as PendingRow[];

  // TikTok tokens, once per run, keyed by creator. A list error is
  // logged, not silently ignored (P2-8) — with no tokens every
  // TikTok row below fails as "not connected", and the log is the
  // only trace that the real cause was the token lookup.
  const { data: tokenRows, error: tokenListError } = await supabase.rpc(
    "list_tiktok_tokens_for_refresh"
  );
  if (tokenListError) {
    console.error(
      "[refresh] list_tiktok_tokens_for_refresh failed:",
      tokenListError.message
    );
    summary.errors.push(
      `Could not list TikTok tokens: ${tokenListError.message}`
    );
  }
  const tokensByUser = new Map<string, TokenRow>();
  for (const row of (tokenRows ?? []) as TokenRow[]) {
    tokensByUser.set(row.user_id, row);
    // Re-save legacy plaintext tokens encrypted, so the database
    // never keeps a usable token in the clear after this runs.
    if (
      process.env.ENCRYPTION_KEY &&
      (!isEncryptedToken(row.access_token) ||
        (row.refresh_token && !isEncryptedToken(row.refresh_token)))
    ) {
      const { error: saveError } = await supabase.rpc("save_tiktok_tokens", {
        p_user_id: row.user_id,
        p_open_id: row.open_id,
        p_access_token: encryptToken(decryptToken(row.access_token)),
        p_refresh_token: row.refresh_token
          ? encryptToken(decryptToken(row.refresh_token))
          : "",
        p_token_expires_at: row.token_expires_at,
        p_refresh_expires_at: row.refresh_expires_at,
      });
      if (saveError) {
        // P2-8: a failed re-save used to be retried forever with
        // no trace. Log it; the plaintext token stays until a
        // later run succeeds.
        console.error(
          `[refresh] could not re-save encrypted TikTok tokens for user ${row.user_id.slice(0, 8)}:`,
          saveError.message
        );
      }
    }
  }

  // Connected YouTube channels, once per run, keyed by creator —
  // the refresh only counts a video from the creator's own channel.
  const { data: channelRows, error: channelListError } = await supabase.rpc(
    "list_youtube_channels_for_refresh"
  );
  if (channelListError) {
    console.error(
      "[refresh] list_youtube_channels_for_refresh failed:",
      channelListError.message
    );
    summary.errors.push(
      `Could not list YouTube channels: ${channelListError.message}`
    );
  }
  const youtubeChannelByUser = new Map<string, string>();
  for (const row of (channelRows ?? []) as YouTubeChannelRow[]) {
    youtubeChannelByUser.set(row.user_id, row.channel_id);
  }

  for (const row of pending) {
    summary.checked += 1;
    const platform = row.platform;
    const last = row.views_refreshed_at
      ? new Date(row.views_refreshed_at).getTime()
      : 0;
    if (last && Date.now() - last < VIEW_REFRESH_MS) {
      summary.skipped += 1;
      tally(platform, "skipped");
      continue;
    }

    if (platform === "instagram") {
      summary.skipped += 1;
      tally(platform, "skipped");
      summary.errors.push(
        `Instagram not connected yet — ${row.id.slice(0, 8)} skipped.`
      );
      // P2-8: stamp the skip too — an unstamped Instagram row
      // stays stalest-first forever and crowds out good rows
      // exactly like a failed row.
      await stampAttempt(row);
      continue;
    }

    if (platform === "youtube") {
      // Anti-fraud gate: only the creator's own connected channel
      // counts. No connection, or a video from another channel, is
      // never counted — the stored views stay as they are.
      const connectedChannel = youtubeChannelByUser.get(row.user_id);
      if (!connectedChannel) {
        summary.failed += 1;
        tally(platform, "failed");
        summary.errors.push(
          `YouTube ${row.id.slice(0, 8)}: creator has not connected YouTube.`
        );
        await stampAttempt(row);
        continue;
      }
      const result = await fetchYouTubeVideoDetails(row.post_url);
      if ("error" in result) {
        summary.failed += 1;
        tally(platform, "failed");
        summary.errors.push(`YouTube ${row.id.slice(0, 8)}: ${result.error}`);
        await stampAttempt(row);
        continue;
      }
      if (result.channelId !== connectedChannel) {
        summary.failed += 1;
        tally(platform, "failed");
        summary.errors.push(
          `YouTube ${row.id.slice(0, 8)}: video is not from the creator's connected YouTube channel — not counted.`
        );
        await stampAttempt(row);
        continue;
      }
      const { error: applyError } = await supabase.rpc("apply_view_refresh", {
        p_submission_id: row.id,
        p_views: result.views,
        p_likes: result.likes,
        p_comments: result.comments,
      });
      if (applyError) {
        summary.failed += 1;
        tally(platform, "failed");
        summary.errors.push(
          `YouTube ${row.id.slice(0, 8)}: could not save (${applyError.message})`
        );
        continue;
      }
      summary.updated += 1;
      tally(platform, "updated");
      continue;
    }

    if (platform === "tiktok") {
      const tokenRow = tokensByUser.get(row.user_id);
      if (!tokenRow) {
        summary.failed += 1;
        tally(platform, "failed");
        summary.errors.push(
          `TikTok ${row.id.slice(0, 8)}: creator has not connected TikTok.`
        );
        await stampAttempt(row);
        continue;
      }
      const accessToken = decryptToken(tokenRow.access_token);
      const refreshToken = decryptToken(tokenRow.refresh_token);
      if (!accessToken) {
        summary.failed += 1;
        tally(platform, "failed");
        summary.errors.push(
          `TikTok ${row.id.slice(0, 8)}: saved login cannot be used.`
        );
        await stampAttempt(row);
        continue;
      }
      const tokens: TikTokTokens = {
        accessToken,
        refreshToken,
        tokenExpiresAt: tokenRow.token_expires_at,
        refreshExpiresAt: tokenRow.refresh_expires_at,
      };
      const result = await fetchTikTokViews(row.post_url, tokens);
      if (result.tokens) {
        // Tokens were refreshed — save the new ones back encrypted.
        const { error: saveError } = await supabase.rpc("save_tiktok_tokens", {
          p_user_id: tokenRow.user_id,
          p_open_id: tokenRow.open_id,
          p_access_token: encryptToken(result.tokens.accessToken),
          p_refresh_token: encryptToken(result.tokens.refreshToken),
          p_token_expires_at: result.tokens.tokenExpiresAt,
          p_refresh_expires_at: result.tokens.refreshExpiresAt,
        });
        if (saveError) {
          // P2-8: log it — a silently failed save was retried
          // forever with no trace.
          console.error(
            `[refresh] could not save refreshed TikTok tokens for user ${tokenRow.user_id.slice(0, 8)}:`,
            saveError.message
          );
          summary.errors.push(
            `TikTok ${row.id.slice(0, 8)}: refreshed login could not be saved (${saveError.message})`
          );
        }
      }
      if ("error" in result) {
        summary.failed += 1;
        tally(platform, "failed");
        summary.errors.push(`TikTok ${row.id.slice(0, 8)}: ${result.error}`);
        await stampAttempt(row);
        continue;
      }
      const { error: applyError } = await supabase.rpc("apply_view_refresh", {
        p_submission_id: row.id,
        p_views: result.views,
        // TikTok may omit an engagement count — keep the stored
        // number then, instead of zeroing it.
        p_likes: result.likes ?? row.likes ?? 0,
        p_comments: result.comments ?? row.comments ?? 0,
      });
      if (applyError) {
        summary.failed += 1;
        tally(platform, "failed");
        summary.errors.push(
          `TikTok ${row.id.slice(0, 8)}: could not save (${applyError.message})`
        );
        continue;
      }
      summary.updated += 1;
      tally(platform, "updated");
      continue;
    }

    summary.skipped += 1;
    tally(platform, "skipped");
    summary.errors.push(`Unknown platform "${platform}" — skipped.`);
    await stampAttempt(row);
  }

  return fresh(summary);
}
