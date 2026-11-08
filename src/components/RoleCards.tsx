import Link from "next/link";

/**
 * The only signup entry: two big role cards. Creators sign up with
 * Full Name and go to onboarding; brands sign up with Brand Name and
 * go straight to the campaign form. Used on the Home hero and on the
 * Signup page (before a role is picked).
 */
export default function RoleCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-3xl border border-lime/40 bg-card p-6 text-left">
        <p className="text-3xl" aria-hidden>
          🎬
        </p>
        <h2 className="mt-2 text-xl font-extrabold text-fg">
          I am a Creator
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-fg/60">
          Post clips, get paid per view.
        </p>
        <Link
          href="/signup?role=creator"
          className="mt-4 inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-black text-black transition hover:bg-limedark"
        >
          Start Earning
        </Link>
      </div>
      <div className="rounded-3xl border border-fg/10 bg-card p-6 text-left">
        <p className="text-3xl" aria-hidden>
          🏢
        </p>
        <h2 className="mt-2 text-xl font-extrabold text-fg">
          Launch Campaigns
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-fg/60">
          Launch a campaign, get viral clips.
        </p>
        <Link
          href="/signup?role=brand"
          className="mt-4 inline-block rounded-full bg-red-500 px-5 py-2.5 text-sm font-black text-white transition hover:bg-red-600"
        >
          Launch Campaign
        </Link>
      </div>
    </div>
  );
}
