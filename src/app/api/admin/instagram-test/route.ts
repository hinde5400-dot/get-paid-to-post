import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { fetchInstagramViews } from "@/lib/views/instagram";
import { decryptToken } from "@/lib/views/crypto";

/**
 * GET /api/admin/instagram-test?url=<reel-url> — owner-only
 * diagnostic: read one Reel's views + engagement through the
 * OWNER's own connected Instagram account, using the same
 * fetchInstagramViews the submissions and refresh flows use.
 *
 * Purpose: prove the Instagram views read end-to-end (media list
 * + `views` insight) without needing a live campaign or a
 * submission. Returns only the numbers (never the token).
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
    return NextResponse.json(
      { error: "Instagram test is owner-only." },
      { status: 403 }
    );
  }
  const postUrl = new URL(request.url).searchParams.get("url") ?? "";
  if (!postUrl) {
    return NextResponse.json(
      { error: "Pass ?url=<instagram-reel-link>." },
      { status: 400 }
    );
  }
  const { data: conn } = await supabase
    .from("instagram_connections")
    .select("ig_user_id, access_token, token_expires_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!conn) {
    return NextResponse.json(
      { error: "No Instagram account connected." },
      { status: 400 }
    );
  }
  const accessToken = decryptToken(conn.access_token as string);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Saved Instagram login cannot be read." },
      { status: 400 }
    );
  }
  const result = await fetchInstagramViews(postUrl, {
    accessToken,
    igUserId: conn.ig_user_id as string,
    tokenExpiresAt: conn.token_expires_at as string | null,
  });
  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error });
  }
  return NextResponse.json({
    ok: true,
    views: result.views,
    likes: result.likes,
    comments: result.comments,
    postedAt: result.postedAt,
  });
}
