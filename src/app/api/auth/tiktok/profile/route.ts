import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/views/crypto";

/**
 * GET /api/auth/tiktok/profile — re-read the linked TikTok account's
 * profile (username / display name / avatar) from TikTok and update
 * the saved connection.
 *
 * Used by /connect when a connection row exists but TikTok never
 * returned a name during the callback (the profile call failed
 * there) — so the card shows the real account instead of a
 * placeholder. The access token lives 24h; if it already expired
 * this returns whatever is stored and the card falls back gracefully.
 */
export const dynamic = "force-dynamic";

const USER_INFO_URL =
  "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username";

interface TikTokUser {
  open_id?: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
  username?: string;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }
  // P2-13: ?validate=1 is a LIVE token check (used by /connect for
  // named rows). It skips the stored-name short-circuit below and
  // calls TikTok for real; a dead token answers 401 connected:false
  // instead of the graceful stored-name fallback.
  const validate =
    new URL(request.url).searchParams.get("validate") === "1";
  const invalid = () =>
    NextResponse.json({ connected: false }, { status: 401 });
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  const { data: conn, error } = await supabase
    .from("tiktok_connections")
    .select("id, username, display_name, avatar_url, access_token")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !conn) {
    return NextResponse.json({ connected: false }, { status: 404 });
  }
  const row = conn as {
    id: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    access_token: string;
  };
  if (!validate && (row.username || row.display_name)) {
    return NextResponse.json({
      connected: true,
      username: row.username ?? null,
      display_name: row.display_name ?? null,
      avatar_url: row.avatar_url ?? null,
    });
  }
  // No name stored (or ?validate=1) — ask TikTok again with the
  // saved access token (decrypted; tokens are stored encrypted
  // since migration 0018).
  const accessToken = decryptToken(row.access_token);
  if (!accessToken) {
    if (validate) return invalid();
    return NextResponse.json({
      connected: true,
      username: null,
      display_name: null,
      avatar_url: row.avatar_url ?? null,
    });
  }
  try {
    const res = await fetch(USER_INFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (validate) return invalid();
      return NextResponse.json({
        connected: true,
        username: null,
        display_name: null,
        avatar_url: row.avatar_url ?? null,
      });
    }
    const info = (await res.json()) as { data?: { user?: TikTokUser } };
    const profile = info.data?.user;
    if (!profile || (!profile.username && !profile.display_name)) {
      if (validate) return invalid();
      return NextResponse.json({
        connected: true,
        username: null,
        display_name: null,
        avatar_url: row.avatar_url ?? null,
      });
    }
    await supabase
      .from("tiktok_connections")
      .update({
        username: profile.username ?? null,
        display_name: profile.display_name ?? null,
        avatar_url: profile.avatar_url ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return NextResponse.json({
      connected: true,
      username: profile.username ?? null,
      display_name: profile.display_name ?? null,
      avatar_url: profile.avatar_url ?? null,
    });
  } catch {
    if (validate) return invalid();
    return NextResponse.json({
      connected: true,
      username: null,
      display_name: null,
      avatar_url: row.avatar_url ?? null,
    });
  }
}
