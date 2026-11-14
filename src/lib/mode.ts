import { cache } from "react";
import { cookies } from "next/headers";
import { getCurrentUser, getProfile, isOwner } from "./auth";
import { getBrandCampaigns, getUserSubmissions } from "./data";
import { MODE_COOKIE } from "./constants";
import type { UserProfile } from "./types";
import type { User } from "@supabase/supabase-js";

/**
 * Creator / Brand mode split (Turn's final structure, 2026-11-13,
 * switch relaxed 2026-11-14).
 *
 * A signed-in user sees ONE navigation, never both:
 * - creator mode: Discover | My Posts | Earnings | More
 * - brand mode:   My Campaigns | Launch Campaign | Payments | Brand Profile
 *
 * Default mode is the user's users.role. ANY signed-in user can
 * switch modes, one click, either way (Turn's order 2026-11-14:
 * the switch must work creator -> brand and brand -> creator):
 * a creator who switches to brand mode lands on brand pages and
 * can launch a campaign (that makes them a brand); a brand who
 * switches to creator mode lands on Discover and can post clips.
 * The pages themselves enforce the split — brand pages are open
 * to any signed-in user, creator pages redirect brand-mode users
 * to /brand/campaigns — so the cookie alone never leaks one
 * mode's content into the other.
 *
 * The mode lives in a cookie (MODE_COOKIE) so the server layout
 * can render the right nav on first paint — BottomNav is a client
 * component rendered from the server layout, and localStorage is
 * invisible to the server. An invalid cookie value falls back to
 * the role default, never to the other mode.
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
  // Any signed-in user may sit in either mode (Turn 2026-11-14:
  // the switch works both ways, one click). The pages enforce the
  // split, so a mode the user has no content for yet shows that
  // mode's honest empty state, never the other mode's content.
  if (wanted === "brand") mode = "brand";
  if (wanted === "creator") mode = "creator";

  return {
    user,
    profile,
    isAdmin: isOwner(profile),
    role,
    mode,
    brandCapable,
    creatorCapable,
    // Any signed-in user can switch — the switch is shown to
    // every logged-in user, in both modes.
    canSwitch: true,
  };
});
