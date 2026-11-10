import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

// Campaign image upload (migration 0032): Brand Logo and Thumbnail
// are REQUIRED file uploads on the /brands form (Turn's decision
// 2026-11-10) — not link fields any more. The form uploads each
// image here at confirmed submit, then sends the returned public
// URL in the campaign-create POST.
//
// POST — multipart/form-data with `file` + `kind` ("logo" |
// "thumbnail"). Images only (PNG, JPG, WebP), max 2 MB each.
// Stored in the PUBLIC 'campaign-images' bucket at
// <user_id>/<uuid>.<ext> (the insert policy only allows a brand
// under its own user folder), so the returned URL can be rendered
// directly on Discover cards. Returns { ok, url, path }.
// Mirrors the brand-chat proof upload (messages route) — same
// server-side upload through the user's own session, same
// error style. The campaign-create API re-validates that the URL
// it receives really lives in this bucket.

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
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
  if (!auth.user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }
  // Campaign images belong to brands: a blocked account or a
  // random creator could otherwise store files in the public
  // bucket with no campaign attached. (MIME-only validation stays
  // as-is — a full signature sniff is a later hardening step.)
  const profile = await getProfile(auth.user.id);
  if (profile?.is_blocked) {
    return NextResponse.json(
      { error: "This account is blocked." },
      { status: 403 }
    );
  }
  if (!profile || (profile.role !== "brand" && !profile.is_admin)) {
    return NextResponse.json(
      { error: "Only brand accounts can upload campaign images." },
      { status: 403 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Upload an image file." },
      { status: 400 }
    );
  }
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  if (kind !== "logo" && kind !== "thumbnail") {
    return NextResponse.json(
      { error: "Upload kind must be logo or thumbnail." },
      { status: 400 }
    );
  }
  const file = form.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Choose an image to upload." },
      { status: 400 }
    );
  }
  const ext = IMAGE_EXTENSIONS[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Image must be PNG, JPG or WebP." },
      { status: 400 }
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image must be 2 MB or smaller." },
      { status: 400 }
    );
  }

  const key = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("campaign-images")
    .upload(key, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    if (/campaign-images|bucket/i.test(uploadError.message)) {
      return NextResponse.json(
        {
          error:
            "Image uploads are not set up yet (migration 0032). Please try again later.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data } = supabase.storage
    .from("campaign-images")
    .getPublicUrl(key);
  return NextResponse.json({ ok: true, url: data.publicUrl, path: key });
}
