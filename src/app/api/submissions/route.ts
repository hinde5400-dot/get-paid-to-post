import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "crypto";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import {
  COOLDOWN_MS,
  HOW_MADE_MIN_WORDS,
  MAX_APPROVED_CLIPS_PER_PLATFORM,
  MAX_PROOF_SCREENSHOTS,
  PLATFORM_LABELS,
  SUBMIT_WINDOW_MINUTES,
  SUBMIT_WINDOW_MS,
} from "@/lib/constants";
import { fetchPostedTime } from "@/lib/views/posted-time";
import { countWords, validatePostUrl, validateProofUrl } from "@/lib/validate";
import { rateLimit } from "@/lib/rate-limit";
import { canonicalizePostUrl } from "@/lib/canonical-url";
import type { Platform } from "@/lib/types";
import { platformsFromRow, platformNamesText } from "@/lib/types";
import { fetchYouTubeVideoDetails } from "@/lib/views/youtube";
import {
  fetchTikTokViews,
  type TikTokTokens,
} from "@/lib/views/tiktok";
import { decryptToken, encryptToken } from "@/lib/views/crypto";

interface BundleBody {
  campaignId?: string;
  tiktok?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  howMade?: string;
  proofScreenshots?: string[];
}

export async function POST(request: Request) {
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }
  const profile = await getProfile(user.id);
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
  }
  // Best-effort rate limit (see lib/rate-limit.ts): 10 bundle
  // submits per minute per user — stops accidental double-submits
  // and runaway loops.
  const rl = rateLimit(`submissions:${user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many submissions — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  const body = (await request.json()) as BundleBody;
  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", body.campaignId ?? "")
    .single();
  if (campError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found." },
      { status: 404 }
    );
  }
  if (!campaign.is_funded || campaign.status !== "live") {
    return NextResponse.json(
      { error: "This campaign is not live yet." },
      { status: 400 }
    );
  }
  // Ended campaigns must not accept submissions by direct API call
  // either: duration passed, or the budget is spent.
  if (
    campaign.ends_at &&
    new Date(campaign.ends_at as string).getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { error: "This campaign has ended." },
      { status: 400 }
    );
  }
  if (Number(campaign.budget_left ?? 0) <= 0) {
    return NextResponse.json(
      { error: "This campaign's budget has run out." },
      { status: 400 }
    );
  }

  // Platforms this campaign accepts (migration 0012): the platforms
  // array when present, otherwise the legacy single platform column.
  // Bundle rule: at least 2 links when the campaign runs on 2+
  // platforms, 1 link when it runs on a single platform.
  const allowedPlatforms = platformsFromRow(
    campaign as Record<string, unknown>
  );
  const minLinks = Math.min(2, allowedPlatforms.length);
  const platformNames = platformNamesText(allowedPlatforms);

  const links: { platform: Platform; url: string }[] = [];
  if (body.tiktok?.trim())
    links.push({ platform: "tiktok", url: body.tiktok.trim() });
  if (body.instagram?.trim())
    links.push({ platform: "instagram", url: body.instagram.trim() });
  if (body.youtube?.trim())
    links.push({ platform: "youtube", url: body.youtube.trim() });

  if (links.length < minLinks) {
    return NextResponse.json(
      {
        error:
          minLinks === 1
            ? `Submit your ${platformNames} link.`
            : `Submit at least ${minLinks} links on the campaign's platforms (${platformNames}) together — each clip is then reviewed and paid on its own.`,
      },
      { status: 400 }
    );
  }
  for (const l of links) {
    if (!allowedPlatforms.includes(l.platform)) {
      return NextResponse.json(
        {
          error: `This campaign only accepts clips on ${platformNames}.`,
        },
        { status: 400 }
      );
    }
    const check = validatePostUrl(l.url, l.platform);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
  }

  // Canonicalize BEFORE the duplicate check (and before the
  // YouTube ownership gate): youtu.be / /shorts/ links become the
  // watch URL, vm/vt.tiktok.com and ig.me short links resolve to
  // their final URL. The canonical form is what gets stored, so
  // the same video pasted under a different spelling is caught as
  // a duplicate. Resolution never blocks a submit — on any failure
  // the submitted URL is kept (see canonicalizePostUrl).
  for (const l of links) {
    l.url = await canonicalizePostUrl(l.url, l.platform);
  }

  // YouTube ownership gate (2026-11-09): a YouTube link only
  // counts when the video belongs to the creator's CONNECTED
  // channel. Without this, anyone could paste any viral video's
  // link and claim its views.
  const youtubeLink = links.find((l) => l.platform === "youtube");
  // When the YouTube video itself was posted (30-minute rule) —
  // captured here so the submit route reuses the gate's lookup.
  let youtubePublishedAt: string | null = null;
  if (youtubeLink) {
    const { data: ytConn } = await supabase
      .from("youtube_connections")
      .select("channel_id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const channelId = (ytConn as { channel_id?: string } | null)
      ?.channel_id;
    if (!channelId) {
      return NextResponse.json(
        {
          error:
            "Connect your YouTube channel first on the Connect page — only videos from your own connected channel can be submitted.",
        },
        { status: 400 }
      );
    }
    const details = await fetchYouTubeVideoDetails(youtubeLink.url);
    if ("error" in details) {
      // Link problems block the submit; API problems do not.
      // "Video not found or not public" / "Could not read a video
      // ID" mean the link is wrong. "Could not reach YouTube" /
      // "YouTube API error" / missing API key mean YouTube itself
      // failed — blocking every submit during an outage and
      // blaming the creator's link would be the wrong error.
      const apiFailed =
        details.error.startsWith("Could not reach YouTube") ||
        details.error.startsWith("YouTube API error") ||
        details.error.startsWith("YouTube API key is not set up");
      if (!apiFailed) {
        return NextResponse.json(
          {
            error: `Could not verify this YouTube video (${details.error}) — please check the link and try again.`,
          },
          { status: 400 }
        );
      }
      // API failure: the gate is skipped — youtubePublishedAt
      // stays null, so the clip is flagged unverified for the
      // admin's hand-check (ownership + post time).
    } else {
      if (details.channelId !== channelId) {
        return NextResponse.json(
          {
            error:
              "This YouTube video is not from your connected YouTube channel. Submit only videos from the channel you connected.",
          },
          { status: 400 }
        );
      }
      youtubePublishedAt = details.publishedAt;
    }
  }

  // TikTok ownership gate (same rule as YouTube): a TikTok link
  // only counts when the video is in the creator's CONNECTED
  // TikTok account. TikTok's video/query only ever returns the
  // authorized user's own videos, so a successful lookup IS the
  // ownership proof. Without this, anyone could paste any viral
  // TikTok video and claim its views — the hole YouTube's gate
  // was built to stop, silently absent for TikTok.
  const tiktokLink = links.find((l) => l.platform === "tiktok");
  // When the TikTok video itself was posted (30-minute rule) —
  // captured here so the posted-time loop reuses the gate's
  // lookup instead of calling TikTok a second time.
  let tiktokPostedAt: string | null = null;
  if (tiktokLink) {
    const { data: tkConn } = await supabase
      .from("tiktok_connections")
      .select(
        "user_id, open_id, access_token, refresh_token, token_expires_at, refresh_expires_at"
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (!tkConn) {
      return NextResponse.json(
        {
          error:
            "Connect your TikTok account first on the Connect page — only videos from your own connected TikTok account can be submitted.",
        },
        { status: 400 }
      );
    }
    const accessToken = decryptToken(tkConn.access_token as string);
    const refreshToken = decryptToken(tkConn.refresh_token as string);
    if (!accessToken) {
      return NextResponse.json(
        {
          error:
            "Your TikTok login could not be read — reconnect TikTok on the Connect page and try again.",
        },
        { status: 400 }
      );
    }
    const tokens: TikTokTokens = {
      accessToken,
      refreshToken,
      tokenExpiresAt: tkConn.token_expires_at as string | null,
      refreshExpiresAt: tkConn.refresh_expires_at as string | null,
    };
    const result = await fetchTikTokViews(tiktokLink.url, tokens);
    if ("error" in result) {
      if (result.tokens) {
        // Tokens were refreshed during the failed lookup — save
        // them back encrypted (same as the 3-hour refresh does).
        await supabase.rpc("save_tiktok_tokens", {
          p_user_id: tkConn.user_id,
          p_open_id: tkConn.open_id,
          p_access_token: encryptToken(result.tokens.accessToken),
          p_refresh_token: encryptToken(result.tokens.refreshToken),
          p_token_expires_at: result.tokens.tokenExpiresAt,
          p_refresh_expires_at: result.tokens.refreshExpiresAt,
        });
      }
      if (result.error.startsWith("Video not found")) {
        return NextResponse.json(
          {
            error:
              "This TikTok video is not in your connected TikTok account. Submit only videos from the account you connected.",
          },
          { status: 400 }
        );
      }
      if (result.error.startsWith("TikTok login expired")) {
        return NextResponse.json(
          {
            error:
              "Your TikTok login expired — reconnect TikTok on the Connect page and try again.",
          },
          { status: 400 }
        );
      }
      // "TikTok could not be reached right now" / unreadable
      // video ID: the API failed, not the creator — allow the
      // submit flagged unverified for the admin's hand-check
      // (tiktokPostedAt stays null, so the clip is unverified).
    } else {
      if (result.tokens) {
        await supabase.rpc("save_tiktok_tokens", {
          p_user_id: tkConn.user_id,
          p_open_id: tkConn.open_id,
          p_access_token: encryptToken(result.tokens.accessToken),
          p_refresh_token: encryptToken(result.tokens.refreshToken),
          p_token_expires_at: result.tokens.tokenExpiresAt,
          p_refresh_expires_at: result.tokens.refreshExpiresAt,
        });
      }
      tiktokPostedAt = result.postedAt;
    }
  }

  // 30-minute submit rule (admin batch 2, Turn's decision
  // 2026-11-10, matches Content Rewards exactly): the post link
  // must be submitted within 30 minutes of the video being
  // posted. The posted time is fetched from the platform API;
  // when it cannot be obtained (Instagram has no API access yet,
  // or the API fails) the submit is allowed but flagged
  // "posted time unverified" for the admin to check by hand.
  // Checked BEFORE any insert, so a too-old link rejects the
  // whole bundle instead of half-creating it.
  const postedInfo: { postedAt: string | null; unverified: boolean }[] = [];
  for (const l of links) {
    let postedAt: string | null = null;
    try {
      const res = await fetchPostedTime(
        l.platform,
        l.url,
        user.id,
        // YouTube: the gate already fetched publishedAt — null
        // when the gate was skipped (API failure), which flags the
        // clip unverified for the admin's hand-check.
        l.platform === "youtube" ? youtubePublishedAt : undefined,
        // TikTok: the ownership gate already fetched create_time —
        // null when the gate was skipped (API failure).
        l.platform === "tiktok" ? tiktokPostedAt : undefined
      );
      const ms = res.postedAt ? new Date(res.postedAt).getTime() : NaN;
      postedAt = Number.isFinite(ms) ? res.postedAt : null;
    } catch {
      // An API failure must not block the submit — flag it
      // unverified and let the admin check the post time.
      postedAt = null;
    }
    if (postedAt) {
      const ageMs = Math.max(0, Date.now() - new Date(postedAt).getTime());
      if (ageMs > SUBMIT_WINDOW_MS) {
        return NextResponse.json(
          {
            error: `This ${PLATFORM_LABELS[l.platform]} video was posted more than ${SUBMIT_WINDOW_MINUTES} minutes ago. Link submitted more than 30 minutes after the video was posted (30-minute limit) — submit your link within 30 minutes of posting.`,
          },
          { status: 400 }
        );
      }
    }
    postedInfo.push({ postedAt, unverified: postedAt === null });
  }

  const howMade = (body.howMade ?? "").trim();
  if (countWords(howMade) < HOW_MADE_MIN_WORDS) {
    return NextResponse.json(
      {
        error: `Tell us how you made this post — at least ${HOW_MADE_MIN_WORDS} words.`,
      },
      { status: 400 }
    );
  }

  const proof = (body.proofScreenshots ?? [])
    .map((p) => String(p).trim())
    .filter(Boolean)
    .slice(0, MAX_PROOF_SCREENSHOTS);
  if (proof.length < 1) {
    return NextResponse.json(
      { error: "Please add at least one originality-proof screenshot link." },
      { status: 400 }
    );
  }
  // Proof must be a real URL (image/screenshot link), not any string.
  for (const p of proof) {
    const proofCheck = validateProofUrl(p);
    if (!proofCheck.ok) {
      return NextResponse.json(
        { error: proofCheck.error ?? "Proof must be a real link." },
        { status: 400 }
      );
    }
  }

  // Clip limit (P0 batch 2): 15 APPROVED clips per platform per
  // creator, per campaign. Only status='approved' rows count —
  // rejected submissions do NOT count (rejected = done, no
  // resubmit), and each platform in this bundle is checked on its
  // own, naming the platform that is already at the limit.
  for (const l of links) {
    const { count: approvedCount } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("campaign_id", campaign.id)
      .eq("platform", l.platform)
      .eq("status", "approved");
    if ((approvedCount ?? 0) >= MAX_APPROVED_CLIPS_PER_PLATFORM) {
      return NextResponse.json(
        {
          error: `You already have ${MAX_APPROVED_CLIPS_PER_PLATFORM} approved ${PLATFORM_LABELS[l.platform]} clips for this campaign — the limit is 15 approved clips per platform.`,
        },
        { status: 400 }
      );
    }
  }

  // 2-hour cooldown, per platform, across ALL campaigns on that
  // platform. Only live submissions (pending or approved) start
  // the cooldown — a rejected or duplicate submission does not.
  for (const l of links) {
    const { data: last } = await supabase
      .from("submissions")
      .select("created_at")
      .eq("user_id", user.id)
      .eq("platform", l.platform)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last) {
      const nextAllowed =
        new Date(last.created_at as string).getTime() + COOLDOWN_MS;
      const remaining = nextAllowed - Date.now();
      if (remaining > 0) {
        return NextResponse.json(
          {
            error: `Please wait — you can submit another ${l.platform} clip in ${Math.ceil(remaining / 60000)} minutes. One clip per platform every 2 hours, across all campaigns on this platform.`,
            retryAfterSeconds: Math.ceil(remaining / 1000),
          },
          { status: 429 }
        );
      }
    }
  }

  const bundleId = randomUUID();
  const codes: string[] = [];
  let duplicateWarning = false;

  // Bundle atomicity: check ALL links against the unique
  // (user_id, post_url) constraint BEFORE inserting any. The old
  // code inserted link 1, then failed on link 2's duplicate — the
  // creator saw only an error while link 1 was already live and
  // its cooldown had started.
  for (const l of links) {
    const { data: own } = await supabase
      .from("submissions")
      .select("id")
      .eq("user_id", user.id)
      .eq("post_url", l.url)
      .limit(1)
      .maybeSingle();
    if (own) {
      return NextResponse.json(
        { error: "This link has already been submitted." },
        { status: 400 }
      );
    }
  }

  for (let i = 0; i < links.length; i++) {
    const l = links[i];
    // Same link already submitted by someone else → duplicate, auto-rejected.
    const { data: existing } = await supabase
      .from("submissions")
      .select("id, user_id")
      .eq("post_url", l.url)
      .limit(1)
      .maybeSingle();
    const isDuplicate =
      Boolean(existing) && (existing as { user_id: string }).user_id !== user.id;

    const code = randomBytes(16).toString("hex");
    const { error: insError } = await supabase.from("submissions").insert({
      user_id: user.id,
      campaign_id: campaign.id,
      bundle_id: bundleId,
      submission_code: code,
      post_url: l.url,
      platform: l.platform,
      views: 0,
      likes: 0,
      status: isDuplicate ? "rejected" : "pending",
      earnings: 0,
      rejection_reason: isDuplicate ? "duplicate" : null,
      how_made: howMade,
      proof_screenshots: proof,
      is_duplicate: isDuplicate,
      // 30-minute rule (migration 0031): when the video itself was
      // posted, plus the unverified flag when the API could not
      // supply a posted time.
      posted_at: postedInfo[i]?.postedAt ?? null,
      posted_time_unverified: postedInfo[i]?.unverified ?? true,
    });
    if (insError) {
      // A concurrent submit slipped past the pre-check: roll back
      // the links already inserted in this bundle instead of
      // leaving half a bundle live behind an error.
      await supabase.from("submissions").delete().eq("bundle_id", bundleId);
      return NextResponse.json(
        { error: "This link has already been submitted." },
        { status: 400 }
      );
    }
    codes.push(code);
    if (isDuplicate) duplicateWarning = true;
  }

  return NextResponse.json({
    ok: true,
    codes,
    bundleId,
    duplicateWarning,
    message: duplicateWarning
      ? "Submitted, but a duplicate link was detected and rejected as a duplicate."
      : "Your bundle was submitted and is Under Review at $0 until approved.",
  });
}
