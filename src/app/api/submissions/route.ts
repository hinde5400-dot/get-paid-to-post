import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "crypto";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import {
  COOLDOWN_MS,
  HOW_MADE_MIN_WORDS,
  MAX_POSTS_PER_CAMPAIGN,
  MAX_PROOF_SCREENSHOTS,
} from "@/lib/constants";
import { countWords, validatePostUrl } from "@/lib/validate";
import type { Platform } from "@/lib/types";
import { platformsFromRow, platformNamesText } from "@/lib/types";
import { fetchYouTubeVideoDetails } from "@/lib/views/youtube";

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
            : `Submit at least ${minLinks} links on the campaign's platforms (${platformNames}) together — they are reviewed and paid as one bundle.`,
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

  // YouTube ownership gate (2026-11-09): a YouTube link only
  // counts when the video belongs to the creator's CONNECTED
  // channel. Without this, anyone could paste any viral video's
  // link and claim its views. TikTok does not need this check —
  // Login Kit only ever returns the connected creator's own videos.
  const youtubeLink = links.find((l) => l.platform === "youtube");
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
      return NextResponse.json(
        {
          error: `Could not verify this YouTube video (${details.error}) — please check the link and try again.`,
        },
        { status: 400 }
      );
    }
    if (details.channelId !== channelId) {
      return NextResponse.json(
        {
          error:
            "This YouTube video is not from your connected YouTube channel. Submit only videos from the channel you connected.",
        },
        { status: 400 }
      );
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

  // Max 7 posts per campaign per creator.
  const { count: myCount } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("campaign_id", campaign.id)
    .neq("status", "revoked");
  if ((myCount ?? 0) >= MAX_POSTS_PER_CAMPAIGN) {
    return NextResponse.json(
      {
        error: `You have already submitted the maximum of ${MAX_POSTS_PER_CAMPAIGN} posts for this campaign.`,
      },
      { status: 400 }
    );
  }

  // 2-hour cooldown, per platform.
  for (const l of links) {
    const { data: last } = await supabase
      .from("submissions")
      .select("created_at")
      .eq("user_id", user.id)
      .eq("platform", l.platform)
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
            error: `Please wait — you can submit another ${l.platform} clip in ${Math.ceil(remaining / 60000)} minutes. One clip per platform every 2 hours.`,
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

  for (const l of links) {
    // Same link already submitted by someone else → duplicate, auto-revoked.
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
      status: isDuplicate ? "revoked" : "pending",
      earnings: 0,
      how_made: howMade,
      proof_screenshots: proof,
      is_duplicate: isDuplicate,
    });
    if (insError) {
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
      ? "Submitted, but a duplicate link was detected and revoked automatically."
      : "Your bundle was submitted and is Under Review at $0 until approved.",
  });
}
