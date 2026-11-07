import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./client";

/**
 * Server Supabase client (reads the session from cookies).
 * Returns null when env vars are not configured — pages return empty
 * results and show a setup notice instead of crashing.
 */
export function getServerClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — setting cookies is not
            // possible here; the middleware refreshes the session instead.
          }
        },
      },
    }
  );
}
