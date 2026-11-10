// GET PAID TO POST — when a submitted video was posted (admin batch 2)
// Server-only. Used by POST /api/submissions to enforce the 30-minute
// submit rule: a creator must submit the post link within 30 minutes
// of posting the video. Returns { postedAt: null } when the posted
// time cannot be obtained — the submit is then allowed but flagged
// "posted time unverified" for the admin to check by hand.
//
// Sources (same as the 3-hour view refresh, lib/views/refresh.ts):
// - YouTube: snippet.publishedAt via the API key — the submit route
//   already fetched it for the ownership gate, so it passes it in.
// - TikTok: create_time via video/query (video/list fallback), using
//   the creator's connected TikTok tokens (same load + refresh +
//   save-back pattern as refresh.ts).
// - Instagram: NOT available — no Meta app / API access yet, so the
//   posted time cannot be fetched. Returns null (unverified).
import { fetchTikTokViews, type TikTokTokens } from "./tiktok";
import { fetchYouTubeVideoDetails } from "./youtube";
import { decryptToken, encryptToken } from "./crypto";
import { getServerClient } from "../supabase/server";
import type { Platform } from "../types";

export type PostedTimeResult = { postedAt: string | null };

export async function fetchPostedTime(
  platform: Platform,
  postUrl: string,
  userId: string,
  youtubePublishedAt?: string | null,
  /**
   * Posted time the caller already fetched (the TikTok ownership
   * gate in /api/submissions already called video/query). Passed
   * to avoid a second TikTok API call for the same video.
   */
  preFetchedPostedAt?: string | null
): Promise<PostedTimeResult> {
  if (platform === "youtube") {
    // Prefer the details the submit route already fetched for the
    // ownership gate; fall back to a fresh lookup.
    if (youtubePublishedAt !== undefined) {
      return { postedAt: youtubePublishedAt };
    }
    const details = await fetchYouTubeVideoDetails(postUrl);
    if ("error" in details) return { postedAt: null };
    return { postedAt: details.publishedAt };
  }

  if (platform === "tiktok") {
    // The ownership gate already fetched this video's create_time
    // — reuse it instead of calling TikTok a second time.
    if (preFetchedPostedAt !== undefined) {
      return { postedAt: preFetchedPostedAt };
    }
    const supabase = getServerClient();
    if (!supabase) return { postedAt: null };
    const { data: tokenRow } = await supabase
      .from("tiktok_connections")
      .select(
        "user_id, open_id, access_token, refresh_token, token_expires_at, refresh_expires_at"
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (!tokenRow) return { postedAt: null };
    const accessToken = decryptToken(tokenRow.access_token as string);
    const refreshToken = decryptToken(tokenRow.refresh_token as string);
    if (!accessToken) return { postedAt: null };
    const tokens: TikTokTokens = {
      accessToken,
      refreshToken,
      tokenExpiresAt: tokenRow.token_expires_at as string | null,
      refreshExpiresAt: tokenRow.refresh_expires_at as string | null,
    };
    const result = await fetchTikTokViews(postUrl, tokens);
    if ("error" in result) return { postedAt: null };
    if (result.tokens) {
      // Tokens were refreshed — save the new ones back encrypted
      // (same as the 3-hour refresh does).
      await supabase.rpc("save_tiktok_tokens", {
        p_user_id: tokenRow.user_id,
        p_open_id: tokenRow.open_id,
        p_access_token: encryptToken(result.tokens.accessToken),
        p_refresh_token: encryptToken(result.tokens.refreshToken),
        p_token_expires_at: result.tokens.tokenExpiresAt,
        p_refresh_expires_at: result.tokens.refreshExpiresAt,
      });
    }
    return { postedAt: result.postedAt };
  }

  // Instagram: no Meta app / API access yet — cannot fetch a
  // posted time, so the submit is allowed but flagged unverified.
  return { postedAt: null };
}
