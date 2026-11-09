import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { adminMention, notifyDiscord } from "@/lib/notify";

/**
 * Private two-way brand <-> admin chat for one campaign (migration
 * 0015). Only the campaign's brand owner (or the admin) may read or
 * write here — the proof and the conversation stay attached to the
 * campaign and the owner's personal email is never involved.
 *
 * GET   — list the campaign's messages, oldest first.
 * POST  — send a message: text and/or one image upload (JPEG, PNG,
 *         WebP or GIF, max 5 MB) as multipart/form-data. A text-only
 *         JSON body is also accepted. At least one of text or image
 *         is required. The image is stored in the private
 *         'brand-proofs' bucket at <campaign_id>/<uuid>.<ext>; no
 *         Drive/Imgur links are accepted any more. Any campaign
 *         status: a brand may also follow up after the campaign
 *         goes live.
 * PATCH — admin only: mark this campaign's messages as read
 *         ({ markRead: true }).
 */
async function loadCampaign(
  supabase: NonNullable<ReturnType<typeof getServerClient>>,
  campaignId: string
) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, user_id, status, title, budget_total, brand_name")
    .eq("id", campaignId)
    .single();
  if (error || !data) return null;
  return data as {
    id: string;
    user_id?: string | null;
    status?: string;
    title?: string | null;
    budget_total?: number;
    brand_name?: string | null;
  };
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
    error && /brand_messages|brand-proofs/i.test(error.message ?? "")
  );
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

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
        { error: "Messages are not set up yet (migration 0015). Please try again later." },
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
  const profile = await getProfile(auth.user.id);
  const sender = isOwner(profile) ? "admin" : "brand";

  let text = "";
  let imagePath: string | null = null;
  let messageType: "text" | "image" = "text";

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    text = String(form.get("message") ?? "").trim();
    const file = form.get("image");
    if (file && file instanceof File && file.size > 0) {
      const ext = IMAGE_EXTENSIONS[file.type];
      if (!ext) {
        return NextResponse.json(
          { error: "Proof must be an image (JPEG, PNG, WebP or GIF)." },
          { status: 400 }
        );
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "Proof image must be 5 MB or smaller." },
          { status: 400 }
        );
      }
      const key = `${params.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("brand-proofs")
        .upload(key, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        if (tableMissing(uploadError)) {
          return NextResponse.json(
            { error: "Messages are not set up yet (migration 0015). Please try again later." },
            { status: 400 }
          );
        }
        return NextResponse.json({ error: uploadError.message }, { status: 400 });
      }
      imagePath = key;
      messageType = "image";
    }
  } else {
    // Text-only JSON body (plain messages, admin replies).
    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
    };
    text = String(body.message ?? "").trim();
  }

  if (text.length > 2000) {
    return NextResponse.json(
      { error: "Message must be 2000 characters or less." },
      { status: 400 }
    );
  }
  if (!text && !imagePath) {
    return NextResponse.json(
      { error: "Write a message or attach a proof image." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("brand_messages")
    .insert({
      campaign_id: params.id,
      user_id: auth.user.id,
      message: text,
      sender,
      message_type: messageType,
      image_path: imagePath,
      proof_url: null,
    })
    .select("*")
    .single();
  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json(
        { error: "Messages are not set up yet (migration 0015). Please try again later." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Notify the owner on Discord when the BRAND uploads a payment
  // proof screenshot (fire-and-forget — never breaks the request;
  // a no-op until Turn creates the webhook).
  if (sender === "brand" && messageType === "image") {
    const mention = adminMention();
    const brand = String(
      campaign.brand_name ??
        (profile as { brand_name?: string | null } | null)?.brand_name ??
        "A brand"
    );
    const budget = Number(campaign.budget_total ?? 0);
    const title = String(campaign.title ?? "Untitled campaign");
    const prefix = mention ? `${mention} ` : "";
    void notifyDiscord(
      `${prefix}🧾 Payment proof uploaded — ${brand} attached a screenshot for "${title}" ($${budget} budget). View it: https://get-paid-to-post.vercel.app/admin`
    );
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
        { error: "Messages are not set up yet (migration 0015). Please try again later." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
