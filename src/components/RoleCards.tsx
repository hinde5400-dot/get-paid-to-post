import Link from "next/link";

/**
 * The only signup entry: two big role cards. Creators sign up with
 * Full Name and go to onboarding; brands sign up with Brand Name and
 * go straight to the campaign form. Used on the Home hero and on the
 * Signup page (before a role is picked).
 *
 * The WHOLE card is the link (friend's brand test, 2026-11-11):
 * tapping the card body or title did nothing — only the small
 * button worked — so the brand looked unclickable and the signup
 * looped back to the role page. The button styling stays as the
 * visual CTA inside the card (a span, not a nested link).
 */
export default function RoleCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Link
        href="/signup?role=creator"
        className="block rounded-3xl border border-lime/40 bg-card p-6 text-left transition hover:border-lime"
      >
        <p className="text-3xl" aria-hidden>
          🎬
        </p>
        <h2 className="mt-2 text-xl font-extrabold text-fg">
          I am a Creator
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-fg/60">
          Post clips, get paid per view.
        </p>
        <span className="mt-4 inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-black text-black transition hover:bg-limedark">
          Start Earning
        </span>
      </Link>
      <Link
        href="/signup?role=brand"
        className="block rounded-3xl border border-fg/10 bg-card p-6 text-left transition hover:border-fg/30"
      >
        <p className="text-3xl" aria-hidden>
          🏢
        </p>
        <h2 className="mt-2 text-xl font-extrabold text-fg">
          Launch Campaigns
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-fg/60">
          Launch a campaign, get real creators posting your clips.
        </p>
        <span className="mt-4 inline-block rounded-full bg-neutral-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-neutral-500">
          Launch Campaign
        </span>
      </Link>
    </div>
  );
}
