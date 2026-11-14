import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

// Brand profile update (brand wizard step 1, migration 0050):
// PATCH — the signed-in brand saves its organization name,
// website and short description to its own public.users row.
// Only the brand's own row is ever touched (RLS "users update
// own" + the id filter below); a blocked account updates nothing.
export async function PATCH(request: Request) {
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
  if (!profile || (profile.role !== "brand" && !profile.is_admin)) {
    return NextResponse.json(
      { error: "Only brand accounts can update a brand profile." },
      { status: 403 }
    );
  }
  let body: {
    brandName?: string;
    website?: string | null;
    brandDescription?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request — send a valid JSON body." },
      { status: 400 }
    );
  }
  const updates: Record<string, string | null> = {};
  if (body.brandName !== undefined) {
    const name = String(body.brandName ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "This field is required: Organization name." },
        { status: 400 }
      );
    }
    if (name.length > 100) {
      return NextResponse.json(
        { error: "Organization name must be 100 characters or less." },
        { status: 400 }
      );
    }
    updates.brand_name = name;
  }
  if (body.website !== undefined) {
    const site = String(body.website ?? "").trim();
    if (site.length > 500) {
      return NextResponse.json(
        { error: "Website must be 500 characters or less." },
        { status: 400 }
      );
    }
    if (site && !/^https?:\/\/.+\..+/.test(site)) {
      return NextResponse.json(
        { error: "Website must be a valid link starting with http:// or https://." },
        { status: 400 }
      );
    }
    updates.website = site || null;
  }
  if (body.brandDescription !== undefined) {
    const desc = String(body.brandDescription ?? "").trim();
    if (desc.length > 500) {
      return NextResponse.json(
        { error: "Description must be 500 characters or less." },
        { status: 400 }
      );
    }
    updates.brand_description = desc || null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, message: "Nothing to update." });
  }
  const { error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", auth.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
