import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getServerClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "@/lib/views/crypto";
import { refreshYouTubeAccessToken } from "@/lib/views/youtube-oauth";

/**
 * GET /api/auth/youtube/profile — re-read the linked YouTube
 * channel's title from Google and update the saved connection.
 *
 * Used by /connect when a connection row exists but Google never
 * returned a channel title during the callback — so the card shows
 * the real channel instead of a placeholder. The access token lives
 * ~1h; if it already expired this refreshes it once with the saved
 * refresh token and re-saves the new access token encrypted.
 */
export const dynamic = "force-dynamic";

const CHANNELS_URL =
  "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";

interface ChannelResponse {
  items?: {
    id?: string;
    snippet?: {
      title?: string;
      customUrl?: string;
    };
  }[];
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  const { data: conn, error } = await supabase
    .from("youtube_connections")
    .select(
      "id, channel_id, channel_title, channel_handle, access_token, refresh_token, token_expires_at"
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !conn) {
    return NextResponse.json({ connected: false }, { status: 404 });
  }
  const row = conn as {
    id: string;
    channel_id: string;
    channel_title?: string | null;
    channel_handle?: string | null;
    access_token: string;
    refresh_token: string;
    token_expires_at?: string | null;
  };
  if (row.channel_title) {
    return NextResponse.json({
      connected: true,
      channel_id: row.channel_id,
      channel_title: row.channel_title,
      channel_handle: row.channel_handle ?? null,
    });
  }
  // No title stored — ask Google again with the saved access token
  // (decrypted; tokens are stored encrypted since migration 0019).
  let accessToken = decryptToken(row.access_token);
  if (!accessToken) {
    return NextResponse.json({
      connected: true,
      channel_id: row.channel_id,
      channel_title: null,
      channel_handle: row.channel_handle ?? null,
    });
  }
  const fetchChannel = async (token: string) => {
    const res = await fetch(CHANNELS_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ChannelResponse;
    return data.items?.[0] ?? null;
  };
  try {
    let channel = await fetchChannel(accessToken);
    if (!channel && row.refresh_token) {
      // Access token expired (1h) — refresh once and retry.
      const refreshed = await refreshYouTubeAccessToken(
        decryptToken(row.refresh_token)
      );
      if (refreshed) {
        accessToken = refreshed.accessToken;
        await supabase
          .from("youtube_connections")
          .update({
            access_token: encryptToken(refreshed.accessToken),
            token_expires_at: refreshed.tokenExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        channel = await fetchChannel(accessToken);
      }
    }
    if (!channel) {
      return NextResponse.json({
        connected: true,
        channel_id: row.channel_id,
        channel_title: null,
        channel_handle: row.channel_handle ?? null,
      });
    }
    await supabase
      .from("youtube_connections")
      .update({
        channel_title: channel.snippet?.title ?? null,
        channel_handle: channel.snippet?.customUrl ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return NextResponse.json({
      connected: true,
      channel_id: row.channel_id,
      channel_title: channel.snippet?.title ?? null,
      channel_handle: channel.snippet?.customUrl ?? null,
    });
  } catch {
    return NextResponse.json({
      connected: true,
      channel_id: row.channel_id,
      channel_title: null,
      channel_handle: row.channel_handle ?? null,
    });
  }
}
