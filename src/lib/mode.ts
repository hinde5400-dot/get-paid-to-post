import { cache } from "react";
import { cookies } from "next/headers";
import { getCurrentUser, getProfile, isOwner } from "./auth";
import { getBrandCampaigns, getUserSubmissions } from "./data";
import { MODE_COOKIE } from "./constants";
import type { UserProfile } from "./types";
import type { User } from "@supabase/supabase-js";

/**
 * Creator / Brand mode split (Turn's final structure, 2026-11-13).
 *
 * A signed-in user sees ONE navigation, never both:
 * - creator mode: Discover | My Posts | Earnings | More
 * - brand mode:   My Campaigns | Launch Campaign | Payments | Brand Profile
 *
 * Default mode is the user's users.role. A user is brand-capable
 * when role = "brand" OR they own >= 1 campaign; creator-capable
 * when role = "creator" OR they have >= 1 submission. A user who
 * is capable of BOTH can switch (ModeSwitch writes the cookie);
 * anyone else sees no switch and stays in their one mode.
 *
 * The mode lives in a cookie (MODE_COOKIE) so the server layout
 * can render the right nav on first paint — BottomNav is a client
 * component rendered from the server layout, and localStorage is
 * invisible to the server. An invalid or incapable cookie value
 * falls back to the role default, never to the other mode.
 *
 * Cached per request: layout, Navbar and pages all call this and
 * share one computation (one auth + profile + two capability
 * reads). Capability reads fail soft to false — a DB error never
 * 500s the navbar.
 */
export type UserMode = "creator" | "brand";

export interface ModeContext {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  role: "creator" | "brand";
  /** Effective mode for this request. */
  mode: UserMode;
  brandCapable: boolean;
  creatorCapable: boolean;
  /** True only when the user can use both modes (switch shown). */
  canSwitch: boolean;
}

export const getModeContext = cache(async (): Promise<ModeContext> => {
  const guest: ModeContext = {
    user: null,
    profile: null,
    isAdmin: false,
    role: "creator",
    mode: "creator",
    brandCapable: false,
    creatorCapable: false,
    canSwitch: false,
  };
  const user = await getCurrentUser();
  if (!user) return guest;
  const profile = await getProfile(user.id);
  const role: "creator" | "brand" = profile?.role ?? "creator";

  let ownsCampaigns = false;
  try {
    ownsCampaigns = (await getBrandCampaigns(user.id)).length > 0;
  } catch {
    ownsCampaigns = false;
  }
  let hasSubmissions = false;
  try {
    hasSubmissions = (await getUserSubmissions(user.id)).length > 0;
  } catch {
    hasSubmissions = false;
  }

  const brandCapable = role === "brand" || ownsCampaigns;
  const creatorCapable = role === "creator" || hasSubmissions;

  let mode: UserMode = role === "brand" ? "brand" : "creator";
  const wanted = cookies().get(MODE_COOKIE)?.value;
  if (wanted === "brand" && brandCapable) mode = "brand";
  if (wanted === "creator" && creatorCapable) mode = "creator";

  return {
    user,
    profile,
    isAdmin: isOwner(profile),
    role,
    mode,
    brandCapable,
    creatorCapable,
    canSwitch: brandCapable && creatorCapable,
  };
});
