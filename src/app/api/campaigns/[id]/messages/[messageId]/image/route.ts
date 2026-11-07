import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";

/**
 * View one proof image from the private brand chat. Returns a
 * redirect to a short-lived (5 minute) signed URL for the object in
 * the private 'brand-proofs' bucket — only the campaign's brand
 * owner or the admin may open it. The image is never public.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string; messageId: string } }
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
  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select("id, user_id")
    .eq("id", params.id)
    .single();
  if (campError || !campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const profile = await getProfile(auth.user.id);
  const allowed =
    (campaign as { user_id?: string | null }).user_id === auth.user.id ||
    isOwner(profile);
  if (!allowed) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const { data: msg, error: msgError } = await supabase
    .from("brand_messages")
    .select("id, campaign_id, message_type, image_path")
    .eq("id", params.messageId)
    .eq("campaign_id", params.id)
    .single();
  if (msgError || !msg) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }
  const row = msg as {
    message_type?: string | null;
    image_path?: string | null;
  };
  if (row.message_type !== "image" || !row.image_path) {
    return NextResponse.json(
      { error: "This message has no image." },
      { status: 404 }
    );
  }
  const { data: signed, error: signError } = await supabase.storage
    .from("brand-proofs")
    .createSignedUrl(row.image_path, 300);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Could not open the proof image." },
      { status: 400 }
    );
  }
  return NextResponse.redirect(signed.signedUrl);
}
