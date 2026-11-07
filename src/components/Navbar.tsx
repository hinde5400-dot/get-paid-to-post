import { getCurrentUser, getProfile } from "@/lib/auth";
import { getCampaigns, getUserSubmissions } from "@/lib/data";
import SideMenu from "./SideMenu";
import ProfileMenu from "./ProfileMenu";
import Logo from "./Logo";
import DiscordButton from "./DiscordButton";

/**
 * Header: hamburger menu at the top-LEFT, logo CENTER, Discord
 * button and profile icon at the top-RIGHT. Navigation lives in the
 * sidebar drawer; the header stays clean.
 */
export default async function Navbar() {
  const user = await getCurrentUser();

  // The creator's name, never "Guest" for a logged-in user: the
  // profile row (migration 0005) first, then the signup metadata
  // (saved before the migration runs), then the email.
  let userName: string | null = null;
  if (user) {
    const profile = await getProfile(user.id);
    const metaName = user.user_metadata?.full_name;
    userName =
      profile?.full_name ??
      (typeof metaName === "string" && metaName.trim() ? metaName : null);
  }

  // Campaigns the signed-in user has joined (for the JOINED section
  // of the sidebar drawer). Empty for guests.
  let joined: { id: string; title: string }[] = [];
  if (user) {
    const [subs, campaigns] = await Promise.all([
      getUserSubmissions(user.id),
      getCampaigns(),
    ]);
    const ids = new Set(subs.map((s) => s.campaign_id));
    joined = campaigns
      .filter((c) => ids.has(c.id))
      .map((c) => ({ id: c.id, title: c.title }));
  }

  return (
    <header className="sticky top-0 z-40 border-b border-fg/10 bg-ink/95 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Hamburger at the top-left opens the slide-in sidebar drawer. */}
        <SideMenu
          userEmail={user?.email ?? null}
          userName={userName}
          joined={joined}
        />

        {/* Centered logo. */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <Logo />
        </div>

        {/* Discord + profile icon at the top-right. */}
        <div className="flex items-center gap-2">
          <DiscordButton compact />
          <ProfileMenu userEmail={user?.email ?? null} userName={userName} />
        </div>
      </div>
    </header>
  );
}
