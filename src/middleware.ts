/**
 * Runs on every request. The Supabase middleware refreshes the
 * session and tells us who is logged in; protected pages redirect
 * guests to /login with "Please login to continue".
 */
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/my-posts",
  "/earnings",
  "/admin",
  "/connect",
  "/submit",
  "/onboarding",
  "/brands/payment",
];

/** Only relative in-site paths are accepted as a post-login target —
 *  the same rule as safeNext() in src/app/auth/callback/route.ts. */
function safeNext(raw: string | null): string | null {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return null;
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;
  // /contact is retired — /support is the one support page.
  if (pathname === "/contact") {
    const url = request.nextUrl.clone();
    url.pathname = "/support";
    url.search = "";
    return NextResponse.redirect(url, 308);
  }
  const isProtected = PROTECTED_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("message", "login-required");
    const next = safeNext(pathname);
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  // Logged-in users never see the auth pages: /login and /signup
  // bounce them to Discover with "You are already logged in".
  if (
    user &&
    (pathname === "/login" || pathname === "/signup")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/discover";
    url.search = "message=already-logged-in";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
