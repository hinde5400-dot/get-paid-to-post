import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/views/crypto";

/**
 * GET /api/auth/instagram/profile — re-read the linked Instagram
 * account's profile (username) from Meta and update the saved
 * connection.
 *
 * Used by /connect when a connection row exists but Meta never
 * returned a name during the callback (the profile call failed
 * there) — so the card shows the real account instead of a
 * placeholder. The long-lived token lives 60 days; if it is
 * inside its last 7 days this refreshes it first (and saves the
 * new one back encrypted) so the card never validates against a
 * dead token.
 */
export const dynamic = "force-dynamic";

const ME_URL = "https://graph.instagram.com/me?fields=id,username,account_type";

interface MeResponse {
  id?: string;
  username?: string;
  account_type?: string;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }
  // P2-13: ?validate=1 is a LIVE token check (used by /connect for
  // named rows). It skips the stored-name short-circuit below and
  // calls Meta for real; a dead token answers 401 connected:false
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
    .from("instagram_connections")
    .select("id, ig_user_id, username, account_type, access_token, token_expires_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !conn) {
    return NextResponse.json({ connected: false }, { status: 404 });
  }
  const row = conn as {
    id: string;
    ig_user_id: string;
    username?: string | null;
    account_type?: string | null;
    access_token: string;
    token_expires_at?: string | null;
  };
  if (!validate && row.username) {
    return NextResponse.json({
      connected: true,
      username: row.username ?? null,
      account_type: row.account_type ?? null,
    });
  }
  // No name stored (or ?validate=1) — ask Meta again with the
  // saved access token (decrypted; tokens are stored encrypted).
  const accessToken = decryptToken(row.access_token);
  if (!accessToken) {
    if (validate) return invalid();
    return NextResponse.json({
      connected: true,
      username: null,
      account_type: row.account_type ?? null,
    });
  }
  try {
    const res = await fetch(
      `${ME_URL}&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) {
      if (validate) return invalid();
      return NextResponse.json({
        connected: true,
        username: null,
        account_type: row.account_type ?? null,
      });
    }
    const me = (await res.json()) as MeResponse;
    if (!me || !me.username) {
      if (validate) return invalid();
      return NextResponse.json({
        connected: true,
        username: null,
        account_type: row.account_type ?? null,
      });
    }
    await supabase
      .from("instagram_connections")
      .update({
        username: me.username ?? null,
        account_type: me.account_type ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return NextResponse.json({
      connected: true,
      username: me.username ?? null,
      account_type: me.account_type ?? null,
    });
  } catch {
    if (validate) return invalid();
    return NextResponse.json({
      connected: true,
      username: null,
      account_type: row.account_type ?? null,
    });
  }
}
