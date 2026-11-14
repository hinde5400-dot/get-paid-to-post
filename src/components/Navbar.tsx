import { getCampaigns, getUserSubmissions } from "@/lib/data";
import { getModeContext } from "@/lib/mode";
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
  // Mode + user + profile (creator / brand navigation split) —
  // cached per request, so this shares the auth/profile reads
  // with the layout and the pages.
  const { user, profile, isAdmin, mode, canSwitch } = await getModeContext();

  // The creator's name, never "Guest" for a logged-in user: the
  // profile row (migration 0005) first, then the signup metadata
  // (saved before the migration runs), then the email.
  let userName: string | null = null;
  if (user) {
    const metaName = user.user_metadata?.full_name;
    userName =
      profile?.full_name ??
      (typeof metaName === "string" && metaName.trim() ? metaName : null);
  }

  // Campaigns the signed-in user has joined (for the JOINED section
  // of the sidebar drawer). Empty for guests. Forms #26: the data
  // getters THROW on DB error — a failed lookup must not 500 the
  // whole navbar (it renders on every page), so fall back to an
  // empty joined list; the pages themselves show their own honest
  // error states when their data fails to load.
  let joined: { id: string; title: string }[] = [];
  if (user) {
    try {
      const [subs, campaigns] = await Promise.all([
        getUserSubmissions(user.id),
        getCampaigns(),
      ]);
      const ids = new Set(subs.map((s) => s.campaign_id));
      joined = campaigns
        .filter((c) => ids.has(c.id))
        .map((c) => ({ id: c.id, title: c.title }));
    } catch {
      joined = [];
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-fg/10 bg-ink/95 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Hamburger at the top-left opens the slide-in sidebar drawer. */}
        <SideMenu
          userEmail={user?.email ?? null}
          userName={userName}
          isAdmin={isAdmin}
          joined={joined}
          mode={mode}
          canSwitch={canSwitch}
        />

        {/* Centered logo. */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <Logo />
        </div>

        {/* Discord + profile icon at the top-right. */}
        <div className="flex items-center gap-2">
          <DiscordButton compact />
          <ProfileMenu userEmail={user?.email ?? null} userName={userName} isAdmin={isAdmin} mode={mode} />
        </div>
      </div>
    </header>
  );
}
