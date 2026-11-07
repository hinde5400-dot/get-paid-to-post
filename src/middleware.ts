import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/my-posts",
  "/earnings",
  "/admin",
  "/connect",
  "/submit",
];

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  // Session refresh is handled by updateSession. Page-level guards
  // (server components) redirect logged-out visitors to /login.
  const isProtected = PROTECTED_PREFIXES.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );
  if (isProtected) {
    // Let the page decide — it can render a setup notice when Supabase
    // is not configured yet, instead of a hard redirect loop.
    return response;
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
