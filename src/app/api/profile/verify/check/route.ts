// Bio-code verification — check the code is in the public bio.
//
// POST { platform, run_id? } → checks the issued code is really
// in the creator's public bio. YouTube via the Data API key;
// TikTok from the public page (retried 3 times server-side);
// Instagram via the Apify Instagram Profile Scraper actor —
// Instagram blocks Vercel's datacenter IPs outright, so Vercel
// NEVER fetches Instagram directly any more (Turn's order,
// 2026-11-13). An Apify run takes 30–90 seconds, so the check
// starts the run, saves its id on the row, returns { pending },
// and the card polls every 10 seconds until it finishes. All
// three platforms verify AUTOMATICALLY — there is no
// screenshot/manual path. A bio the server cannot read is
// reported as "wait 2 minutes and click Verify again" — never as
// "code not found", never as verified.
import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import type { Platform } from "@/lib/types";
import {
  codeInBio,
  fetchProfileBio,
} from "@/lib/verify/bio";
import {
  apifyItemBio,
  apifyItemUsername,
  getApifyDatasetItems,
  getApifyRun,
  startApifyProfileRun,
} from "@/lib/verify/apify";

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
  apify_run_id: string | null;
  apify_run_started_at: string | null;
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
  let body: { platform?: string; run_id?: string };
  try {
    body = (await request.json()) as { platform?: string; run_id?: string };
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
  // Fresh Verify clicks are limited to 10 per 10 minutes. Polls
  // for an Apify run in progress (run_id present) get their own
  // generous limit — the card polls every 10 seconds while a run
  // finishes, and that must never trip the abuse limit.
  const rl = body.run_id
    ? rateLimit(`verify-poll:${user.id}`, 60, 300_000)
    : rateLimit(`verify-check:${user.id}`, 10, 600_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many checks — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
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
  // Instagram goes through Apify, never a direct fetch (see the
  // header). TikTok / YouTube continue below, unchanged.
  if (platform === "instagram") {
    return handleInstagramCheck(supabase, row, body.run_id);
  }
  const code = row.bio_code;
  const result = await fetchProfileBio(
    platform,
    row.handle,
    row.channel_id ?? undefined
  );

  if ("error" in result) {
    // YouTube errors are specific (bad link, API key) — pass them
    // through. TikTok returns "unreadable" when the public page
    // did not carry a bio after 3 server-side tries. (Instagram
    // never reaches here — it goes through Apify above.)
    if (platform === "youtube") {
      return NextResponse.json({ verified: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      verified: false,
      error:
        "We couldn't find your bio — try again in 2 minutes, or contact Support.",
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

/**
 * Instagram verification via Apify (Turn's order, 2026-11-13).
 * Never fetches Instagram from Vercel. One call either starts a
 * run (returns { pending, run_id }) or reports on the run the
 * card is polling. A run started in the last 5 minutes is reused
 * instead of starting a duplicate — re-clicks, refreshes and the
 * card's own retries all land on the same run. Terminal run
 * states clear the stored run id so the next Verify starts fresh.
 */
async function handleInstagramCheck(
  supabase: NonNullable<ReturnType<typeof getServerClient>>,
  row: VerifiedProfileRow,
  runId?: string
) {
  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json(
      {
        verified: false,
        error: "Instagram verification is not set up yet — contact Support.",
      },
      { status: 400 }
    );
  }
  const code = row.bio_code ?? "";
  const clearRunId = async () => {
    await supabase
      .from("verified_profiles")
      .update({
        apify_run_id: null,
        apify_run_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  };

  let activeRunId = runId ?? null;
  if (!activeRunId && row.apify_run_id && row.apify_run_started_at) {
    const started = new Date(row.apify_run_started_at).getTime();
    if (Date.now() - started < 5 * 60_000) activeRunId = row.apify_run_id;
  }
  if (!activeRunId) {
    const started = await startApifyProfileRun(row.handle);
    if ("error" in started) {
      return NextResponse.json({
        verified: false,
        retryable: true,
        error: "Instagram is taking a moment — try Verify again in 2 minutes.",
      });
    }
    activeRunId = started.runId;
    await supabase
      .from("verified_profiles")
      .update({
        apify_run_id: started.runId,
        apify_run_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return NextResponse.json({
      verified: false,
      pending: true,
      run_id: activeRunId,
    });
  }

  const run = await getApifyRun(activeRunId);
  if ("error" in run) {
    // Apify itself did not answer — the run may still be going.
    // Stay pending; the card caps its polls and then shows the
    // "taking a moment" message.
    return NextResponse.json({
      verified: false,
      pending: true,
      run_id: activeRunId,
    });
  }
  if (run.status === "RUNNING" || run.status === "READY") {
    return NextResponse.json({
      verified: false,
      pending: true,
      run_id: activeRunId,
    });
  }
  if (run.status !== "SUCCEEDED") {
    await clearRunId();
    return NextResponse.json({
      verified: false,
      retryable: true,
      error: "Instagram is taking a moment — try Verify again in 2 minutes.",
    });
  }

  const items = await getApifyDatasetItems(run.datasetId);
  await clearRunId();
  if ("error" in items) {
    return NextResponse.json({
      verified: false,
      retryable: true,
      error: "Instagram is taking a moment — try Verify again in 2 minutes.",
    });
  }
  // One item per handle — take ours (or the only one).
  const item =
    items.find((i) => apifyItemUsername(i) === row.handle) ?? items[0];
  const bio = item ? apifyItemBio(item) : null;
  if (bio === null) {
    return NextResponse.json({
      verified: false,
      retryable: true,
      error: "Instagram is taking a moment — try Verify again in 2 minutes.",
    });
  }
  if (!codeInBio(bio, code)) {
    return NextResponse.json({
      verified: false,
      error:
        "The code was not found in your bio yet — check the code is in your profile bio exactly as shown, wait a couple of minutes, and try again.",
    });
  }

  const { error } = await supabase
    .from("verified_profiles")
    .update({
      verified_at: new Date().toISOString(),
      verified_by: "auto",
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
    platform: "instagram",
    handle: row.handle,
    verified_at: new Date().toISOString(),
  });
}
