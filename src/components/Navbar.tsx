import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getCampaigns, getUserSubmissions } from "@/lib/data";
import { BRAND_NAME } from "@/lib/constants";
import SideMenu from "./SideMenu";
import ProfileMenu from "./ProfileMenu";

/**
 * TryShoot-style header: hamburger menu at the top-LEFT, logo CENTER,
 * profile icon at the top-RIGHT with a Guest / signed-in dropdown.
 * Navigation lives in the sidebar drawer; the header stays clean.
 */
export default async function Navbar() {
  const user = await getCurrentUser();

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
        <SideMenu userEmail={user?.email ?? null} joined={joined} />

        {/* Centered logo. */}
        <Link
          href="/"
          className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime font-display text-lg font-black text-black">
            G
          </span>
          <span className="hidden font-display text-lg font-black uppercase leading-tight tracking-tight text-fg min-[420px]:block">
            {BRAND_NAME}
          </span>
        </Link>

        {/* Profile icon at the top-right with dropdown. */}
        <ProfileMenu userEmail={user?.email ?? null} />
      </div>
    </header>
  );
}
