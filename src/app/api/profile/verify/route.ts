// Bio-code verification — issue a code + read verification status.
//
// POST { platform, profile_url } → issues (or reuses) the unique
// bio code for that platform. The creator writes the code in their
// profile bio, waits 2 minutes, then hits Verify
// (/api/profile/verify/check). A verified profile is LOCKED: the
// same handle cannot be claimed by another user, and this user
// cannot switch to a different handle without Disconnecting it
// first (DELETE below frees the slot). GET returns this user's
// rows for the Connect page.
import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import type { Platform } from "@/lib/types";
import {
  BIO_CODE_EXPIRY_MINUTES,
  BIO_VERIFY_WAIT_SECONDS,
  generateBioCode,
  parseProfileLink,
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
  updated_at: string;
};

function publicRow(row: VerifiedProfileRow) {
  const pending =
    !row.verified_at &&
    row.bio_code &&
    row.code_expires_at &&
    new Date(row.code_expires_at).getTime() > Date.now();
  return {
    platform: row.platform,
    profile_url: row.profile_url,
    handle: row.handle,
    verified_at: row.verified_at,
    verified_by: row.verified_by,
    // The code is only shown while it is pending — a verified
    // profile has nothing left to prove.
    bio_code: pending ? row.bio_code : null,
    code_expires_at: pending ? row.code_expires_at : null,
    // The 2-minute timer runs from when the code was issued.
    issued_at: row.updated_at,
  };
}

export async function GET() {
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }
  const { data } = await supabase
    .from("verified_profiles")
    .select("*")
    .eq("user_id", auth.user.id);
  const rows = ((data ?? []) as VerifiedProfileRow[]).map(publicRow);
  return NextResponse.json({ profiles: rows });
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
  const rl = rateLimit(`verify-issue:${user.id}`, 10, 3_600_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many code requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  let body: { platform?: string; profile_url?: string };
  try {
    body = (await request.json()) as { platform?: string; profile_url?: string };
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
  const profileUrl = (body.profile_url ?? "").trim();
  if (!profileUrl) {
    return NextResponse.json(
      { error: "Paste your profile link first." },
      { status: 400 }
    );
  }
  const parsed = parseProfileLink(platform, profileUrl);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const handle = parsed.handle;
  const channelId = parsed.channelId ?? null;

  // Existing row for this user + platform.
  const { data: existing } = await supabase
    .from("verified_profiles")
    .select("*")
    .eq("user_id", user.id)
    .eq("platform", platform)
    .maybeSingle();
  const row = existing as VerifiedProfileRow | null;

  if (row?.verified_at) {
    if (row.handle === handle) {
      return NextResponse.json({
        already_verified: true,
        platform,
        handle,
        verified_at: row.verified_at,
      });
    }
    return NextResponse.json(
      {
        error: `Your verified ${platform} profile is locked to @${row.handle} — disconnect it on the Connect page to connect a different one.`,
      },
      { status: 400 }
    );
  }

  // A pending code that has not expired is reused — re-issuing
  // would strand the code the creator may already have in their bio.
  if (
    row?.bio_code &&
    row.code_expires_at &&
    new Date(row.code_expires_at).getTime() > Date.now() &&
    row.handle === handle
  ) {
    return NextResponse.json({
      code: row.bio_code,
      expires_at: row.code_expires_at,
      handle,
      platform,
      wait_seconds: BIO_VERIFY_WAIT_SECONDS,
      reused: true,
      issued_at: row.updated_at,
    });
  }

  // Nobody else may already own this profile (verified rows only —
  // a pending code from another user does not block you).
  const { data: clash } = await supabase
    .from("verified_profiles")
    .select("id")
    .eq("platform", platform)
    .eq("handle", handle)
    .not("verified_at", "is", null)
    .neq("user_id", user.id)
    .maybeSingle();
  if (clash) {
    return NextResponse.json(
      {
        error:
          "This profile is already verified by another account — if it is yours, ask the admin to help.",
      },
      { status: 400 }
    );
  }
  // YouTube /channel/ links carry the channel ID already: the same
  // channel claimed under its @handle by someone else must clash too.
  if (platform === "youtube" && channelId) {
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
          error:
            "This channel is already verified by another account — if it is yours, ask the admin to help.",
        },
        { status: 400 }
      );
    }
  }

  const code = generateBioCode();
  const expiresAt = new Date(
    Date.now() + BIO_CODE_EXPIRY_MINUTES * 60_000
  ).toISOString();
  const { data: saved, error } = await supabase
    .from("verified_profiles")
    .upsert(
      {
        user_id: user.id,
        platform,
        profile_url: profileUrl,
        handle,
        channel_id: channelId,
        bio_code: code,
        code_expires_at: expiresAt,
        verified_at: null,
        verified_by: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    )
    .select("*")
    .single();
  if (error || !saved) {
    console.error("Bio-code issue failed:", error);
    return NextResponse.json(
      { error: "Could not issue a code — please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({
    code,
    expires_at: expiresAt,
    handle,
    platform,
    wait_seconds: BIO_VERIFY_WAIT_SECONDS,
    reused: false,
    issued_at: (saved as VerifiedProfileRow).updated_at,
  });
}

/**
 * Disconnect a profile (DELETE ?platform=tiktok) — frees the slot
 * so the creator can connect a different profile on that platform.
 * The row is deleted outright: a pending code dies with it, and a
 * verified profile stops matching submissions immediately. Needs
 * the "verified_profiles delete own" policy (migration 0047) —
 * without it RLS refuses the delete. Idempotent: deleting a
 * platform with no row is still ok.
 */
export async function DELETE(request: Request) {
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }
  const profile = await getProfile(auth.user.id);
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
  }
  const platform = new URL(request.url).searchParams.get("platform") as
    | Platform
    | null;
  if (!platform || !PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: "Unknown platform." },
      { status: 400 }
    );
  }
  const rl = rateLimit(`bio-disconnect:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  const { error } = await supabase
    .from("verified_profiles")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("platform", platform);
  if (error) {
    console.error("Bio-code disconnect failed:", error);
    return NextResponse.json(
      { error: "Could not disconnect — please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, platform });
}
