// Bio-code verification — manual path: submit a bio screenshot.
//
// POST { platform, proof_url } → saves a screenshot link on the
// pending row. The admin opens the live profile, checks the code
// is in the bio, and approves it in /admin. Used when the server
// could not read the bio automatically (TikTok / Instagram pages
// usually do not carry a bio for a server fetch).
import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateProofUrl } from "@/lib/validate";
import type { Platform } from "@/lib/types";

const PLATFORMS: Platform[] = ["tiktok", "instagram", "youtube"];

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
  const rl = rateLimit(`verify-proof:${user.id}`, 10, 3_600_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many tries — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  let body: { platform?: string; proof_url?: string };
  try {
    body = (await request.json()) as { platform?: string; proof_url?: string };
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
  const proofUrl = (body.proof_url ?? "").trim();
  const check = validateProofUrl(proofUrl);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("verified_profiles")
    .select("*")
    .eq("user_id", user.id)
    .eq("platform", platform)
    .maybeSingle();
  const row = existing as {
    id: string;
    bio_code: string | null;
    code_expires_at: string | null;
    verified_at: string | null;
  } | null;
  if (!row || !row.bio_code) {
    return NextResponse.json(
      { error: "Get a code first — paste your profile link on the Connect page." },
      { status: 400 }
    );
  }
  if (row.verified_at) {
    return NextResponse.json({
      verified: true,
      message: "Your profile is already verified.",
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

  const { error } = await supabase
    .from("verified_profiles")
    .update({ proof_url: proofUrl, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) {
    console.error("Bio-proof save failed:", error);
    return NextResponse.json(
      { error: "Could not save the screenshot — please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({
    status: "manual_review",
    message:
      "Screenshot saved — the admin will check your bio and verify your profile.",
  });
}
