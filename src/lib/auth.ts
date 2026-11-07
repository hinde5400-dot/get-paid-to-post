import { getServerClient } from "./supabase/server";
import type { UserProfile } from "./types";

/** Current signed-in user (server side), or null. */
export async function getCurrentUser() {
  const supabase = getServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

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
