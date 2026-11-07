import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";

/**
 * Private brand -> admin messages for one campaign (migration 0014).
 * Only the campaign's brand owner (or the admin) may read or write
 * here — the proof and the conversation stay attached to the
 * campaign and the owner's personal email is never involved.
 *
 * GET   — list the campaign's messages, oldest first.
 * POST  — send a message (1–2000 chars) with an optional proof link
 *         (a valid http(s) URL, e.g. a screenshot on Google Drive
 *         or Imgur). Any campaign status: a brand may also follow up
 *         after the campaign goes live.
 * PATCH — admin only: mark this campaign's messages as read
 *         ({ markRead: true }).
 */
async function loadCampaign(
  supabase: NonNullable<ReturnType<typeof getServerClient>>,
  campaignId: string
) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, user_id, status")
    .eq("id", campaignId)
    .single();
  if (error || !data) return null;
  return data as { id: string; user_id?: string | null; status?: string };
}

async function canAccess(
  supabase: NonNullable<ReturnType<typeof getServerClient>>,
  campaign: { user_id?: string | null },
  userId: string
) {
  if (campaign.user_id === userId) return true;
  const profile = await getProfile(userId);
  return isOwner(profile);
}

function tableMissing(error: { message?: string } | null) {
  return Boolean(
    error && /brand_messages/i.test(error.message ?? "")
  );
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
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
  const campaign = await loadCampaign(supabase, params.id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (!(await canAccess(supabase, campaign, auth.user.id))) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const { data, error } = await supabase
    .from("brand_messages")
    .select("*")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: true });
  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json(
        { error: "Messages are not set up yet (migration 0014). Please try again later." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
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
  const campaign = await loadCampaign(supabase, params.id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (!(await canAccess(supabase, campaign, auth.user.id))) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const body = (await request.json()) as {
    message?: string;
    proofUrl?: string;
  };
  const message = String(body.message ?? "").trim();
  if (message.length < 1 || message.length > 2000) {
    return NextResponse.json(
      { error: "Message must be between 1 and 2000 characters." },
      { status: 400 }
    );
  }
  const proofRaw = String(body.proofUrl ?? "").trim();
  let proofUrl: string | null = null;
  if (proofRaw) {
    try {
      const url = new URL(proofRaw);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("bad protocol");
      }
      proofUrl = url.toString();
    } catch {
      return NextResponse.json(
        { error: "Proof link must be a valid http(s) URL." },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("brand_messages")
    .insert({
      campaign_id: params.id,
      user_id: auth.user.id,
      message,
      proof_url: proofUrl,
    })
    .select("*")
    .single();
  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json(
        { error: "Messages are not set up yet (migration 0014). Please try again later." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
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
  if (!isOwner(profile)) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    markRead?: boolean;
  };
  if (body.markRead !== true) {
    return NextResponse.json(
      { error: "Nothing to do." },
      { status: 400 }
    );
  }
  const { error } = await supabase
    .from("brand_messages")
    .update({ is_read: true })
    .eq("campaign_id", params.id)
    .eq("is_read", false);
  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json(
        { error: "Messages are not set up yet (migration 0014). Please try again later." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
