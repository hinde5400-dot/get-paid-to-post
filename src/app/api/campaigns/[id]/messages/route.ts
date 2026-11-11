import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { SITE_URL } from "@/lib/constants";
import { notifyPaymentProof } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { imageBytesMatchMime } from "@/lib/image-validation";
import { isValidTronTxId } from "@/lib/validate";

/**
 * Find a TRON Transaction ID inside a chat message — exactly the
 * same definition as isValidTronTxId (exactly 64 hex chars, no 0x
 * prefix): the 64 hex chars must NOT be part of a longer hex
 * string and must NOT be prefixed with 0x. A 0x-prefixed hash is
 * an Ethereum-style hash, not a TRON TxID, and a 64-hex substring
 * of a longer blob is not a TxID either — neither fires a payment
 * proof alert.
 */
function findTronTxId(text: string): string | null {
  const m = text.match(
    /(?<![0-9a-fA-F])(?<!0x)([0-9a-fA-F]{64})(?![0-9a-fA-F])/
  );
  const candidate = m?.[1] ?? null;
  return candidate && isValidTronTxId(candidate) ? candidate : null;
}

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
 * PATCH — mark this campaign's messages as read
 *         ({ markRead: true }).
 *         Admin: marks every message in the thread read (existing
 *         behaviour — the admin inbox badge counts all unread
 *         rows, so this is left as-is).
 *         Brand owner: marks only the ADMIN's messages read — the
 *         brand reading a reply clears its own "New reply from
 *         admin" badge (Round-4 P2-B6). The brand can never edit
 *         content: the only accepted body is { markRead: true },
 *         and the update touches is_read only (enforced again by
 *         the DB trigger in migration 0014).
 */
async function loadCampaign(
  supabase: NonNullable<ReturnType<typeof getServerClient>>,
  campaignId: string
) {
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, user_id, status, title, budget_total, brand_name, platform_fee, rates, view_bonus_per_1k, rate_per_1m, min_views, max_payout_per_post, payment_tx_id"
    )
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
    platform_fee?: number;
    rates?: Record<string, number> | null;
    view_bonus_per_1k?: number;
    rate_per_1m?: number;
    min_views?: number;
    max_payout_per_post?: number;
    payment_tx_id?: string | null;
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
  // A blocked account reads nothing here — the block is supposed
  // to stop all activity, including brand chat.
  const profile = await getProfile(auth.user.id);
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
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
  // A blocked account sends nothing here — the block is supposed
  // to stop all activity, including brand chat and proof uploads.
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
  }
  // Best-effort rate limit (see lib/rate-limit.ts): 20 chat
  // messages per minute per user per campaign.
  const rl = rateLimit(
    `messages:${auth.user.id}:${params.id}`,
    20,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many messages — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }
  const sender = isOwner(profile) ? "admin" : "brand";

  let text = "";
  let imagePath: string | null = null;
  let messageType: "text" | "image" = "text";

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    text = String(form.get("message") ?? "").trim();
    // Validate the text BEFORE uploading anything: the old code
    // uploaded the proof image first and only then rejected a
    // >2000-char message — orphaning the file in storage with no
    // DB row, and no hint to the brand that the upload happened.
    if (text.length > 2000) {
      return NextResponse.json(
        { error: "Message must be 2000 characters or less." },
        { status: 400 }
      );
    }
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
      // Magic-byte sniff: file.type is client-supplied, so a
      // renamed non-image with a spoofed MIME must not reach the
      // proofs bucket. The bytes must be a real image of the
      // claimed type.
      const proofBytes = new Uint8Array(await file.arrayBuffer());
      if (!imageBytesMatchMime(proofBytes, file.type)) {
        return NextResponse.json(
          {
            error:
              "That file is not a real image — its contents do not match its type. Upload an actual screenshot (JPEG, PNG, WebP or GIF).",
          },
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
    // The message row failed after the image was already stored —
    // delete the orphaned upload instead of leaving it in
    // storage with no DB row pointing at it.
    if (imagePath) {
      await supabase.storage.from("brand-proofs").remove([imagePath]);
    }
    if (tableMissing(error)) {
      return NextResponse.json(
        { error: "Messages are not set up yet (migration 0015). Please try again later." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Notify the owner on Discord when the BRAND sends payment proof
  // in this chat: a Transaction ID pasted in the message, or a
  // proof screenshot uploaded after a TxID was already recorded
  // on the payment page. The TxID is found ANYWHERE in the text —
  // the old anchored regex only matched a message that WAS exactly
  // the hash, so "TxID: <hash>" or the hash inside a sentence never
  // alerted Turn at the exact moment he needs to check his wallet.
  // And an image alone never fires a "payment proof" alert any
  // more: without a TxID there is no payment to verify. The match
  // uses the same definition as isValidTronTxId (exactly 64 hex,
  // no 0x prefix, not part of a longer hex string) — see
  // findTronTxId above.
  // Fire-and-forget — never breaks the request; a no-op until Turn
  // creates the webhook. Same per-brand forum thread as the
  // campaign-created notification.
  if (sender === "brand") {
    const txHashInText = findTronTxId(text);
    const txId =
      txHashInText ??
      (messageType === "image"
        ? (campaign.payment_tx_id as string | null) ?? undefined
        : undefined);
    if (txId) {
      const messageId = (data as { id?: string } | null)?.id;
      void notifyPaymentProof(campaign, {
        txId,
        proofUrl:
          messageType === "image" && messageId
            ? `${SITE_URL}/api/campaigns/${params.id}/messages/${messageId}/image`
            : undefined,
      });
    }
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
  const admin = isOwner(profile);
  // A blocked account marks nothing read.
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
  }
  // Admin-only before Round-4 P2-B6; now the campaign's brand
  // owner may also mark read — but only the admin's messages
  // (their own badge), never the brand's own rows and never any
  // content. Anyone else gets 403.
  const campaign = await loadCampaign(supabase, params.id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const isBrandOwner = campaign.user_id === auth.user.id;
  if (!admin && !isBrandOwner) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  // Best-effort rate limit (see lib/rate-limit.ts): 20 mark-read
  // calls per minute per user per campaign.
  const rl = rateLimit(
    `messages-read:${auth.user.id}:${params.id}`,
    20,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
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
  // The brand marks only admin replies read; the admin marks the
  // whole thread read (existing behaviour — see header).
  const query = supabase
    .from("brand_messages")
    .update({ is_read: true })
    .eq("campaign_id", params.id)
    .eq("is_read", false);
  const { error } = admin
    ? await query
    : await query.eq("sender", "admin");
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
