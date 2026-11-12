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
import { canonicalizePostUrl, resolveRedirectUrl } from "@/lib/canonical-url";
import type { Platform } from "@/lib/types";
import { platformsFromRow, platformNamesText } from "@/lib/types";
import { fetchYouTubeVideoDetails } from "@/lib/views/youtube";
import {
  fetchTikTokViews,
  type TikTokTokens,
} from "@/lib/views/tiktok";
import {
  fetchInstagramViews,
  type InstagramTokens,
} from "@/lib/views/instagram";
import { decryptToken, encryptToken } from "@/lib/views/crypto";

interface BundleBody {
  campaignId?: string;
  tiktok?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  howMade?: string;
  proofScreenshots?: string[];
}

/**
 * Author handle from an Instagram Reel/post URL:
 * instagram.com/<handle>/reel/<id> or /p/<id>. A bare
 * instagram.com/reel/<id> link carries no handle (null) — and a
 * null handle is now REJECTED at submit time (round-3 P1-5): a
 * link with no author cannot be checked against the creator's
 * linked profile, so it must not sail past the ownership gate
 * flagged unverified. ig.me short links are resolved to the real
 * Reel URL first (see below) before this runs.
 */
function instagramHandleFromUrl(raw: string): string | null {
  try {
    const u = new URL(
      /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
    );
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length >= 3 && (segs[1] === "reel" || segs[1] === "reels" || segs[1] === "p")) {
      return segs[0].toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

/** Handle from a stored Instagram profile link (instagram.com/<handle>). */
function instagramHandleFromProfileLink(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  try {
    const u = new URL(
      /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
    );
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length === 0) return null;
    // A profile link is just the handle; a Reel/post link saved
    // by mistake is not a profile link.
    if (segs[0] === "reel" || segs[0] === "reels" || segs[0] === "p") return null;
    return segs[0].toLowerCase();
  } catch {
    return null;
  }
}

/** Proof-URL live check (round-3 P2-15): best-effort HEAD of a
 *  proof link at submit time. A dead link (non-2xx) or a direct
 *  image link that does not answer as an image is rejected — the
 *  syntactic check alone let any `.png` URL on any host pass.
 *  FAIL SOFT like short-link resolution: a host that does not
 *  answer at all (network error / timeout) or refuses HEAD (405)
 *  does NOT block the submit — the admin still opens the link at
 *  review. Screenshot-host page links (Imgur, prnt.sc, …) are
 *  HTML pages, not images, so only their status is checked, never
 *  their content-type. */
const PROOF_HEAD_TIMEOUT_MS = 5000;

async function checkProofUrlLive(
  raw: string
): Promise<{ ok: boolean; error?: string }> {
  const target = /^https?:\/\//i.test(raw.trim())
    ? raw.trim()
    : `https://${raw.trim()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROOF_HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GetPaidToPost/1.0)" },
    });
    if (res.status === 405) return { ok: true };
    if (!res.ok) {
      return {
        ok: false,
        error: `That proof link could not be opened (HTTP ${res.status}) — check the link and try again.`,
      };
    }
    let path = "";
    try {
      path = new URL(target).pathname;
    } catch {
      path = "";
    }
    if (/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(path)) {
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType && !contentType.toLowerCase().startsWith("image/")) {
        return {
          ok: false,
          error:
            "That proof link did not return an image — paste a direct image link (.png, .jpg, .webp or .gif) or a screenshot link from Imgur, Lightshot (prnt.sc), ibb.co or postimages.",
        };
      }
    }
    return { ok: true };
  } catch (err) {
    console.warn(
      `Proof HEAD check failed for ${target}, allowing submit (fail soft):`,
      err instanceof Error ? err.message : err
    );
    return { ok: true };
  } finally {
    clearTimeout(timer);
  }
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

  let body: BundleBody;
  try {
    body = (await request.json()) as BundleBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request — the submission could not be read." },
      { status: 400 }
    );
  }
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
  //
  // The Instagram handle is read BEFORE canonicalization drops
  // the author segment (see canonical-url.ts) — but AFTER
  // resolving an ig.me short link, because ig.me carries no
  // handle itself and the resolved Reel URL does (round-3 P1-5:
  // the handle used to be read from the raw URL, so the resolved
  // handle was discarded and ig.me links bypassed the gate).
  const instagramRawUrl =
    links.find((l) => l.platform === "instagram")?.url ?? null;
  let instagramHandle: string | null = null;
  if (instagramRawUrl) {
    let handleSource = instagramRawUrl;
    try {
      const rawHost = new URL(
        /^https?:\/\//i.test(instagramRawUrl.trim())
          ? instagramRawUrl.trim()
          : `https://${instagramRawUrl.trim()}`
      ).hostname.toLowerCase();
      if (rawHost === "ig.me") {
        handleSource = await resolveRedirectUrl(instagramRawUrl);
      }
    } catch {
      // Unparseable / unresolvable short link: keep the raw URL —
      // the gate below rejects it for having no handle.
    }
    instagramHandle = instagramHandleFromUrl(handleSource);
  }
  for (const l of links) {
    l.url = await canonicalizePostUrl(l.url, l.platform);
  }

  // Instagram ownership gate: Instagram has no API access, so the
  // only ownership signal is the handle in the Reel URL compared
  // with the Instagram profile link the creator saved in
  // onboarding (users.instagram_url). No stored link → the creator
  // must save one first. A mismatching handle → the Reel is not
  // theirs. A URL with no extractable handle (bare
  // instagram.com/reel/<id>, or an ig.me link that did not resolve
  // to a handle-bearing URL) is REJECTED — it cannot be checked
  // against the linked profile at all, so it must not slip past
  // the gate flagged unverified. The admin hand-check remains as
  // the second check, against the handle stored on the submission
  // (migration 0039), not the creator's current profile link.
  const instagramLink = links.find((l) => l.platform === "instagram");
  if (instagramLink) {
    const storedInstagram = profile?.instagram_url ?? null;
    const storedHandle = instagramHandleFromProfileLink(storedInstagram);
    if (!storedInstagram || !storedHandle) {
      return NextResponse.json(
        {
          error:
            "Save your Instagram profile link in onboarding first — Instagram submissions are checked against the profile link you saved there.",
        },
        { status: 400 }
      );
    }
    if (!instagramHandle) {
      return NextResponse.json(
        {
          error:
            "Paste the full Reel link from the profile, not a share link — a bare instagram.com/reel/… link or an ig.me share link does not show whose Reel it is, so it cannot be checked against your linked Instagram profile. Open the Reel on the profile and copy that link instead.",
        },
        { status: 400 }
      );
    }
    if (instagramHandle !== storedHandle) {
      return NextResponse.json(
        {
          error:
            "This Reel is not from your linked Instagram profile — submit only Reels from the Instagram profile you linked in onboarding.",
        },
        { status: 400 }
      );
    }
  }

  // Instagram API ownership gate (2026-11-13, Meta app live):
  // a Reel only counts when it is in the creator's CONNECTED
  // Instagram account. The Graph API's /me/media only ever
  // returns the connected account's own media, so a successful
  // lookup IS the ownership proof — same rule as TikTok. Without
  // this, anyone could paste any viral Reel's link and claim its
  // views. The handle gate above stays as the first check.
  let instagramPostedAt: string | null = null;
  // Instagram fails OPEN on an API outage (like TikTok, unlike
  // YouTube): the submit is still allowed, but flagged unverified
  // for the admin's hand-check (instagramPostedAt stays null).
  let instagramUnverified = false;
  if (instagramLink) {
    const { data: igConn } = await supabase
      .from("instagram_connections")
      .select("user_id, ig_user_id, access_token, token_expires_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!igConn) {
      return NextResponse.json(
        {
          error:
            "Connect your Instagram account first on the Connect page — only Reels from your own connected Instagram account can be submitted.",
        },
        { status: 400 }
      );
    }
    const accessToken = decryptToken(igConn.access_token as string);
    if (!accessToken) {
      return NextResponse.json(
        {
          error:
            "Your Instagram login could not be read — reconnect Instagram on the Connect page and try again.",
        },
        { status: 400 }
      );
    }
    const tokens: InstagramTokens = {
      accessToken,
      tokenExpiresAt: igConn.token_expires_at as string | null,
    };
    const result = await fetchInstagramViews(instagramLink.url, tokens);
    if ("error" in result) {
      if (result.tokens) {
        // Token was refreshed during the failed lookup — save it
        // back encrypted (same as the 3-hour refresh does).
        await supabase.rpc("save_instagram_tokens", {
          p_user_id: igConn.user_id,
          p_ig_user_id: igConn.ig_user_id,
          p_access_token: encryptToken(result.tokens.accessToken),
          p_token_expires_at: result.tokens.tokenExpiresAt,
        });
      }
      if (result.error.startsWith("Reel not found")) {
        return NextResponse.json(
          {
            error:
              "This Reel is not in your connected Instagram account. Submit only Reels from the account you connected.",
          },
          { status: 400 }
        );
      }
      if (result.error.startsWith("Instagram login expired")) {
        return NextResponse.json(
          {
            error:
              "Your Instagram login expired — reconnect Instagram on the Connect page and try again.",
          },
          { status: 400 }
        );
      }
      // "Instagram could not be reached right now" / "Could not
      // read views for this Reel" / unreadable Reel ID: the API
      // failed, not the creator — allow the submit flagged
      // unverified for the admin's hand-check (instagramPostedAt
      // stays null, so the clip is unverified).
      instagramUnverified = true;
    } else {
      if (result.tokens) {
        await supabase.rpc("save_instagram_tokens", {
          p_user_id: igConn.user_id,
          p_ig_user_id: igConn.ig_user_id,
          p_access_token: encryptToken(result.tokens.accessToken),
          p_token_expires_at: result.tokens.tokenExpiresAt,
        });
      }
      instagramPostedAt = result.postedAt;
    }
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
      // Link problems block the submit; API problems block it too
      // (fail CLOSED): the YouTube ownership gate is the only
      // control for channel ownership, so a submit we cannot
      // verify must not slip through flagged unverified — during
      // an outage a wrong-channel video would pass the gate.
      // "Video not found or not public" / "Could not read a video
      // ID" mean the link is wrong. "Could not reach YouTube" /
      // "YouTube API error" / missing API key mean YouTube itself
      // failed — the creator is told plainly to try again, not
      // blamed for their link.
      const apiFailed =
        details.error.startsWith("Could not reach YouTube") ||
        details.error.startsWith("YouTube API error") ||
        details.error.startsWith("YouTube API key is not set up");
      if (apiFailed) {
        return NextResponse.json(
          {
            error:
              "Couldn't verify your YouTube channel — try again.",
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          error: `Could not verify this YouTube video (${details.error}) — please check the link and try again.`,
        },
        { status: 400 }
      );
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
  // Round-3 P2-18: TikTok fails OPEN on an API outage (unlike
  // YouTube, which fails closed). The submit is still allowed,
  // but the creator is told it went in unverified instead of
  // seeing a silent success.
  let tiktokUnverified = false;
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
      if (
        result.error.startsWith("Could not read a video ID") &&
        /\/t\/[^/]+/.test(tiktokLink.url)
      ) {
        // A tiktok.com/t/ share link that could not be resolved
        // server-side: say plainly it could not be verified,
        // instead of "not a video link" — the link itself is a
        // real TikTok share link, we just cannot read the video
        // behind it. The creator pastes the full video link.
        return NextResponse.json(
          {
            error:
              "We couldn't verify this TikTok share link (tiktok.com/t/…) — please paste the full video link (tiktok.com/@you/video/…) instead.",
          },
          { status: 400 }
        );
      }
      // "TikTok could not be reached right now" / unreadable
      // video ID: the API failed, not the creator — allow the
      // submit flagged unverified for the admin's hand-check
      // (tiktokPostedAt stays null, so the clip is unverified),
      // and surface that to the creator in the response (P2-18)
      // instead of a silent success.
      tiktokUnverified = true;
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
  // Instagram: the API gate above already fetched the Reel's
  // posted time (instagramPostedAt) — null when the gate was
  // skipped (API failure), which flags the clip unverified for
  // the admin's hand-check, like a TikTok clip on an API outage
  // (tiktokUnverified above). The UI shows this instead of a
  // silent success. Derived from the same postedInfo flag that is
  // stored as posted_time_unverified.
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
        // TikTok / Instagram: the ownership gate already fetched
        // the posted time — null when the gate was skipped (API
        // failure).
        l.platform === "tiktok"
          ? tiktokPostedAt
          : l.platform === "instagram"
            ? instagramPostedAt
            : undefined
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
    if (l.platform === "instagram" && postedAt === null) {
      instagramUnverified = true;
    }
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
  // Proof must be a real image/screenshot link, not any URL —
  // and not the post link itself (checked against the submitted
  // clip links).
  const postUrls = links.map((l) => l.url);
  for (const p of proof) {
    const proofCheck = validateProofUrl(p, postUrls);
    if (!proofCheck.ok) {
      return NextResponse.json(
        { error: proofCheck.error ?? "Proof must be a real link." },
        { status: 400 }
      );
    }
  }
  // Live HEAD check (round-3 P2-15): a dead proof link is
  // rejected here, not only when the admin opens it at review.
  // A host that does not answer at all fails soft (allowed).
  for (const p of proof) {
    const live = await checkProofUrlLive(p);
    if (!live.ok) {
      return NextResponse.json({ error: live.error }, { status: 400 });
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
      // Instagram handle that matched at submit time (migration
      // 0039, round-3 P2-17): the admin hand-checks the Reel
      // against THIS handle, not the creator's current profile
      // link. Null on non-Instagram rows (and on rows written
      // before the migration).
      instagram_handle_matched:
        l.platform === "instagram" ? instagramHandle : null,
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
    // Round-3 P2-18: TikTok could not be reached, so the TikTok
    // clip(s) went in unverified — the UI shows this instead of
    // a silent success. The submit itself still succeeded.
    ...(tiktokUnverified ? { tiktokUnverified: true } : {}),
    // Instagram equivalent of tiktokUnverified (see above) —
    // Meta could not be reached, so the Instagram clip(s) went
    // in unverified.
    ...(instagramUnverified ? { instagramUnverified: true } : {}),
    message: duplicateWarning
      ? "Submitted, but a duplicate link was detected and rejected as a duplicate."
      : "Your bundle was submitted and is Under Review at $0 until approved.",
  });
}
