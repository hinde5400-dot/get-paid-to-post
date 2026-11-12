import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

/** Only relative in-site paths are accepted as a post-login target. */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

/**
 * Supabase Auth callback — email confirmation.
 *
 * Exchanges the ?code= from the confirmation link for a session,
 * then redirects to ?next= (default /dashboard). Blocked accounts
 * cannot log in here either — same as email login.
 *
 * A fresh account (created within the last 10 minutes) that picked
 * "brand" at signup claims the brand role on public.users through
 * the SECURITY DEFINER RPC claim_oauth_role (migration 0034): only
 * a fresh account with no campaigns and no submissions may claim
 * creator -> brand, and only on its own row. Auth metadata is NEVER
 * the role store — any user can write their own metadata from the
 * browser console, so a metadata fallback would let anyone
 * self-promote to 'brand' and bypass the migration 0010 privilege
 * guard. brand_name is NOT privilege-guarded, so it is written to
 * the profile row directly as well.
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
      const { data: exchanged, error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);
      // A failed / expired code must never proceed: with a stale
      // session present, getUser() below would return the OLD user
      // and the brand-role claim could run on a failed exchange.
      if (exchangeError || !exchanged.session) {
        return NextResponse.redirect(`${origin}/login?message=google-error`);
      }
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

        // public.users.role is the single source of truth.
        let effectiveRole: string = p?.role ?? "creator";

        if (intendedRole === "brand" && isFresh && effectiveRole !== "brand") {
          // Claim the brand role on public.users through the guarded
          // RPC (migration 0034) — never via auth metadata, which
          // the user themselves can write. If the RPC is not
          // applied yet it fails cleanly (error, no throw) and the
          // signup simply lands as a creator.
          if (!p) {
            // Trigger fallback (same as onboarding): create the row
            // first, so the RPC has a row to claim on.
            await supabase.from("users").insert({
              id: user.id,
              email: user.email,
              full_name: displayName,
              brand_name: displayName,
            });
          }
          const { data: claimed, error: claimError } = await supabase.rpc(
            "claim_oauth_role",
            { p_role: "brand" }
          );
          if (!claimError && claimed === "brand") {
            effectiveRole = "brand";
            // brand_name is NOT privilege-guarded: write it to the
            // profile row if it is still missing.
            const { data: after } = await supabase
              .from("users")
              .select("brand_name")
              .eq("id", user.id)
              .single();
            if (
              !(after as { brand_name?: string | null } | null)?.brand_name
            ) {
              await supabase
                .from("users")
                .update({ brand_name: displayName })
                .eq("id", user.id);
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
