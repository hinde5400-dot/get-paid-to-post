import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

/** Only relative in-site paths are accepted as a post-login target. */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

/**
 * Supabase Auth callback — email confirmation AND Google OAuth.
 *
 * Google OAuth: signInWithOAuth cannot carry user metadata, so the
 * role picked on the signup page travels in the callback URL
 * (?role=brand). A brand role cannot be written to public.users by
 * the user themselves — migration 0010's privilege guard blocks
 * non-owners from changing `role` — so the callback stores it in the
 * user's own auth metadata instead (updateUser, always allowed for
 * one's own record), and the brands/dashboard pages read the role
 * with the same metadata fallback the login page already uses.
 * brand_name is NOT privilege-guarded, so it is written to the
 * profile row as well.
 *
 * The brand role is only applied to FRESH accounts (created within
 * the last 10 minutes): an existing user who links Google to their
 * account must keep the role they already have. The 10-minute
 * window is the same signup that just started the OAuth flow.
 *
 * Blocked accounts cannot log in here either — same as email login.
 * A Google sign-in with the same verified email as an existing
 * account lands on that existing account (GoTrue links the identity
 * instead of creating a duplicate, the default while "Allow
 * duplicate emails" stays off in the Supabase dashboard).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // The user cancelled on Google's screen (or Google refused).
  if (searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/login?message=google-cancelled`);
  }

  if (code) {
    const supabase = getServerClient();
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code);
      const { data } = await supabase.auth.getUser();
      const user = data.user ?? null;
      if (user) {
        const roleParam = searchParams.get("role");
        const intendedRole =
          roleParam === "brand" || roleParam === "creator"
            ? roleParam
            : null;

        const { data: profile } = await supabase
          .from("users")
          .select("is_blocked, role, full_name, brand_name")
          .eq("id", user.id)
          .single();
        const p = profile as {
          is_blocked?: boolean;
          role?: string | null;
          full_name?: string | null;
          brand_name?: string | null;
        } | null;

        // Blocked accounts cannot log in — same as email login.
        if (p?.is_blocked) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            `${origin}/login?message=account-blocked`
          );
        }

        const metaRole = user.user_metadata?.role;
        const metaName =
          typeof user.user_metadata?.full_name === "string" &&
          user.user_metadata.full_name.trim()
            ? (user.user_metadata.full_name as string)
            : null;
        const displayName =
          p?.full_name ?? metaName ?? user.email ?? "Brand";

        // Fresh account (created moments ago by this OAuth sign-in)?
        const createdMs = new Date(user.created_at).getTime();
        const isFresh =
          Number.isFinite(createdMs) &&
          Date.now() - createdMs < 10 * 60 * 1000;

        let effectiveRole: string =
          p?.role ?? (typeof metaRole === "string" ? metaRole : "creator");

        if (intendedRole === "brand" && isFresh && effectiveRole !== "brand") {
          // Store the brand role in auth metadata (own record) and
          // carry the brand name onto the profile row (allowed).
          // The public.users role stays 'creator' — the privilege
          // guard forbids user-side role writes; see the header.
          const { data: updated } = await supabase.auth.updateUser({
            data: { role: "brand", brand_name: p?.brand_name ?? displayName },
          });
          const updatedRole = updated.user?.user_metadata?.role;
          if (updatedRole === "brand") {
            effectiveRole = "brand";
            if (p && !p.brand_name) {
              await supabase
                .from("users")
                .update({ brand_name: displayName })
                .eq("id", user.id);
            }
            if (!p) {
              // Trigger fallback (same as onboarding): create the row.
              await supabase.from("users").insert({
                id: user.id,
                email: user.email,
                full_name: displayName,
                brand_name: displayName,
              });
            }
          }
        }

        // Brands land on the campaign form, exactly like email login.
        if (effectiveRole === "brand") {
          return NextResponse.redirect(`${origin}/brands`);
        }
      }
    }
  }
  return NextResponse.redirect(`${origin}${next}`);
}
