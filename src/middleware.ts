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
];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "message=login-required";
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
