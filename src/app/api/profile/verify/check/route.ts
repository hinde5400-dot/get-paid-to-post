// Bio-code verification — check the code is in the public bio.
//
// POST { platform } → fetches the PUBLIC profile bio from the
// server (YouTube via the Data API key; TikTok / Instagram from
// the public page) and checks the issued code is really there.
// A bio the server cannot read is reported as "could not read" —
// never as "code not found" — and the creator is offered the
// manual path (a bio screenshot for the admin) instead.
import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import type { Platform } from "@/lib/types";
import {
  codeInBio,
  fetchProfileBio,
} from "@/lib/verify/bio";

const PLATFORMS: Platform[] = ["tiktok", "instagram", "youtube"];

type VerifiedProfileRow = {
  id: string;
  user_id: string;
  platform: string;
  profile_url: string;
  handle: string;
  channel_id: string | null;
  bio_code: string | null;
  code_expires_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  proof_url: string | null;
};

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
  const rl = rateLimit(`verify-check:${user.id}`, 10, 600_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many checks — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  let body: { platform?: string };
  try {
    body = (await request.json()) as { platform?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const platform = (body.platform ?? "") as Platform;
  if (!PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: "Choose TikTok, Instagram or YouTube." },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("verified_profiles")
    .select("*")
    .eq("user_id", user.id)
    .eq("platform", platform)
    .maybeSingle();
  const row = existing as VerifiedProfileRow | null;
  if (!row || !row.bio_code) {
    return NextResponse.json(
      { error: "Get a code first — paste your profile link on the Connect page." },
      { status: 400 }
    );
  }
  if (row.verified_at) {
    return NextResponse.json({
      verified: true,
      platform,
      handle: row.handle,
      verified_at: row.verified_at,
    });
  }
  if (
    row.code_expires_at &&
    new Date(row.code_expires_at).getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { error: "Your code expired — get a new code on the Connect page." },
      { status: 400 }
    );
  }
  // A screenshot is already waiting for the admin — re-checking
  // the bio would not change anything.
  if (row.proof_url) {
    return NextResponse.json({
      verified: false,
      status: "manual_review",
      message:
        "Your screenshot is waiting for the admin to check — you will see the result on the Connect page.",
    });
  }

  const code = row.bio_code;
  const result = await fetchProfileBio(
    platform,
    row.handle,
    row.channel_id ?? undefined
  );

  if ("error" in result) {
    // YouTube errors are specific (bad link, API key) — pass them
    // through. TikTok / Instagram return "unreadable" when the
    // public page did not carry a bio: offer the manual path.
    if (platform === "youtube") {
      return NextResponse.json({ verified: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      verified: false,
      auto_read_failed: true,
      message:
        "We couldn't read your bio automatically — the profile page didn't load a bio for us. Upload a screenshot of your bio showing the code and the admin will verify it.",
    });
  }

  if (!codeInBio(result.bio, code)) {
    return NextResponse.json({
      verified: false,
      error:
        "The code was not found in your bio yet — check the code is in your profile bio exactly as shown, wait a couple of minutes, and try again.",
    });
  }

  // YouTube: lock to the real channel ID from channels.list, and
  // refuse when another user already verified that channel under
  // its @handle.
  let channelId = row.channel_id;
  if (platform === "youtube" && "channelId" in result) {
    channelId = result.channelId;
    const { data: channelClash } = await supabase
      .from("verified_profiles")
      .select("id")
      .eq("platform", "youtube")
      .eq("channel_id", channelId)
      .not("verified_at", "is", null)
      .neq("user_id", user.id)
      .maybeSingle();
    if (channelClash) {
      return NextResponse.json(
        {
          verified: false,
          error:
            "This channel is already verified by another account — if it is yours, ask the admin to help.",
        },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase
    .from("verified_profiles")
    .update({
      verified_at: new Date().toISOString(),
      verified_by: "auto",
      channel_id: channelId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) {
    console.error("Bio-code verify save failed:", error);
    return NextResponse.json(
      { error: "The code was found, but saving the verification failed — please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({
    verified: true,
    platform,
    handle: row.handle,
    verified_at: new Date().toISOString(),
    channel_title:
      platform === "youtube" && "channelTitle" in result
        ? result.channelTitle
        : undefined,
  });
}
