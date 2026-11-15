import { cache } from "react";
import { getServerClient } from "./supabase/server";
import type { UserProfile } from "./types";

/**
 * Current signed-in user (server side), or null.
 *
 * React-cached per request: the layout, Navbar, Footer and the
 * page each used to call supabase.auth.getUser() separately, so
 * one signed-in page load paid for the same auth round trip 3+
 * times in sequence (2026-11-16 slowness fix). Within one request
 * this now resolves once and every caller shares the result.
 */
export const getCurrentUser = cache(async () => {
  const supabase = getServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

/** The signed-in user's profile row, or null. */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  const supabase = getServerClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  return (data as UserProfile | null) ?? null;
}

/** The first account created becomes the owner (is_admin). */
export function isOwner(profile: UserProfile | null): boolean {
  return profile?.is_admin === true;
}
