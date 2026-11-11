import Link from "next/link";
import { getCurrentUser, getProfile, isOwner } from "@/lib/auth";
import { getBrandCampaigns, isExpiredUnpaidPending } from "@/lib/data";
import BrandForm from "@/components/BrandForm";

const FUNDING_STEPS = [
  { n: "1", t: "Create your campaign", d: "Fill in the form below: brand, logo, title, rate per 1K views, budget and brief. You set your own rate and budget — any amount above $0, no minimums." },
  { n: "2", t: "Your campaign is saved as pending", d: "Nothing goes live yet. Unpaid pending campaigns expire after 7 days — send your payment within 7 days. Chatting alone does not count as payment." },
  { n: "3", t: "Fund the budget in USDT", d: "Send your budget plus the 15% platform fee in USDT (TRC20) to the admin wallet and paste your Transaction ID on the payment page." },
  { n: "4", t: "Campaign goes live", d: "Once payment is verified, your campaign opens to creators on TikTok, Instagram and YouTube." },
  { n: "5", t: "Creators post and submit", d: "Creators post short vertical clips, submit their links, and earn per view." },
  { n: "6", t: "You pay only for verified views", d: "Approved views are paid from your funded budget. Unspent budget stays yours." },
];

export default async function BrandsPage() {
  const user = await getCurrentUser();
  const profile = user ? await getProfile(user.id) : null;
  const owner = isOwner(profile);
  // Brand entry is only from Signup (role=brand) and the Footer.
  // A logged-in creator cannot launch campaigns from a creator
  // account; the owner can always test the form.
  // public.users.role is the single source of truth (migration
  // 0034 claims it there at OAuth signup through a guarded RPC).
  // Auth metadata is user-writable and must never decide a role.
  const role = profile?.role ?? "creator";
  const canLaunch = !user ? false : owner || role !== "creator";
  const initialBrandName =
    profile?.brand_name ?? profile?.full_name ?? null;

  // A logged-in brand goes straight to the campaign form — no
  // "I am a Brand / I am a Creator" choice cards. Logged-out
  // visitors and creators still see the full page as before.
  const isBrand = user !== null && canLaunch;

  // Round-4 P2-B8: a brand with an unpaid pending campaign is
  // told to fund it first instead of stacking new ones.
  // Best-effort — a failed load hides the banner, never the page.
  let unpaidPending: { id: string; title: string } | null = null;
  if (isBrand && user) {
    try {
      const brandCampaigns = await getBrandCampaigns(user.id);
      const found = brandCampaigns.find(
        (c) =>
          c.status === "pending" &&
          !c.payment_tx_id?.trim() &&
          !isExpiredUnpaidPending(c)
      );
      if (found) unpaidPending = { id: found.id, title: found.title };
    } catch {
      unpaidPending = null;
    }
  }

  // The WHOLE card is the link (friend's brand test, 2026-11-11):
  // tapping the card body or title did nothing — only the small
  // button worked. The brand card's "See full pricing" link stays
  // OUTSIDE the outer link (nested links are invalid HTML), as a
  // separate line under the clickable area.
  const brandCardInner = (
    <>
      <p className="text-3xl">🏢</p>
      <h2 className="mt-2 text-xl font-extrabold text-fg">
        I am a Brand
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-fg/60">
        Upload your brand and campaign below. Fund your chosen
        budget upfront and pay only for verified views — plus a
        15% platform fee on top of your budget, no hidden charges.
      </p>
    </>
  );
  const creatorCardInner = (
    <>
      <p className="text-3xl">🎬</p>
      <h2 className="mt-2 text-xl font-extrabold text-fg">
        I am a Creator
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-fg/60">
        Pick a funded campaign, make a clip per the brief, post it, and
        get paid per view.
      </p>
    </>
  );

  const roleSplit = (
    <section className="pt-4 text-center">
      <h1 className="font-display text-4xl font-black uppercase tracking-tight text-fg md:text-5xl">
        For Brands &amp; Creators
      </h1>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-fg/70 md:text-base">
        Brands fund a budget and pay only for verified views. Creators post
        short clips and get paid per view — no follower minimum.
      </p>
      <div className="mx-auto mt-7 grid max-w-2xl gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-lime/40 bg-card p-6 text-left">
          {user ? (
            <a href="#brand-form" className="block">
              {brandCardInner}
              <span className="mt-4 inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-ink">
                Create a campaign
              </span>
            </a>
          ) : (
            <Link href="/signup?role=brand" className="block">
              {brandCardInner}
              <span className="mt-4 inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-ink">
                Sign up as a brand
              </span>
            </Link>
          )}
          <p className="mt-3 text-sm">
            <Link href="/pricing" className="font-bold text-lime hover:underline">
              See full pricing →
            </Link>
          </p>
        </div>
        <div className="rounded-3xl border border-fg/10 bg-card p-6 text-left">
          <Link href="/campaigns" className="block">
            {creatorCardInner}
            <span className="mt-4 inline-block rounded-full border border-fg/25 px-5 py-2.5 text-sm font-bold text-fg hover:border-lime hover:text-lime">
              Browse campaigns
            </span>
          </Link>
        </div>
      </div>
    </section>
  );

  const howFunding = (
    <section>
      <h2 className="mb-6 text-center text-2xl font-extrabold text-fg">
        How Funding Works — 6 steps
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FUNDING_STEPS.map((s) => (
          <div
            key={s.n}
            className="rounded-2xl border border-fg/10 bg-card p-5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime text-lg font-black text-ink">
              {s.n}
            </span>
            <h3 className="mt-3 font-bold text-fg">{s.t}</h3>
            <p className="mt-1 text-sm leading-relaxed text-fg/60">
              {s.d}
            </p>
          </div>
        ))}
        <div className="flex flex-col justify-center rounded-2xl bg-lime p-5">
          <p className="text-lg font-black text-ink">
            Any budget — you decide
          </p>
          <p className="mt-1 text-sm font-medium text-ink/70">
            A campaign only goes live after its budget is funded. Unspent
            budget stays the brand&apos;s.
          </p>
        </div>
      </div>
    </section>
  );

  const benefit = (
    <section className="rounded-3xl border border-fg/10 bg-card p-6">
      <h2 className="text-lg font-extrabold text-fg">
        Why brands use Get Paid To Post
      </h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg/70">
        <li>• Real creators, no follower minimum.</li>
        <li>• You pay only for verified views — never per post alone.</li>
        <li>• Every campaign budget is funded upfront.</li>
        <li>• Every clip comes with proof, reviewed by the admin before it is approved.</li>
        <li>• Unspent budget stays yours.</li>
      </ul>
    </section>
  );

  const protection = (
    <section className="rounded-3xl border border-lime/40 bg-card p-6 md:p-8">
      <h2 className="text-xl font-extrabold text-fg">
        How brand funds are protected
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-fg/70">
        Your budget is funded before your campaign goes live. Creators
        are paid only for verified views at the rate you set — never for
        promises. Any budget left unspent when your campaign ends stays
        yours. We never spend your budget on anything else, and we never
        charge you for views that were not verified.
      </p>
      <ul className="mt-4 space-y-2 text-sm leading-relaxed text-fg/70">
        <li>• Your budget is tracked per campaign and only spent on approved views — ask the admin on Discord for a payout record for your campaign.</li>
        <li>• Payouts go only to approved views, from your funded budget.</li>
        <li>• Fake engagement will lead to the creator&apos;s account being strictly blocked or banned.</li>
      </ul>
    </section>
  );

  const trust = (
    <section className="rounded-3xl border border-lime/40 bg-card p-6 text-center md:p-8">
      <p className="text-sm leading-relaxed text-fg/80">
        We are a professional creator marketplace. All campaigns are
        funded before going live. Creators are paid for real verified
        views only.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {[
          "100% Funded Campaigns Only - Campaign goes live only after payment received",
          "Secure Payments via USDT - 15% platform fee on top, no other charges",
        ].map((badge) => (
          <span
            key={badge}
            className="rounded-full border border-lime/40 bg-lime/10 px-4 py-2 text-xs font-black text-lime"
          >
            {badge}
          </span>
        ))}
      </div>
      <p className="mt-5 text-sm">
        <Link href="/pricing" className="font-bold text-lime hover:underline">
          See full pricing — 15% fee, $500 budget → $575 total →
        </Link>
      </p>
    </section>
  );

  const faq = (
    <section className="rounded-3xl border border-fg/10 bg-card p-6">
      <h2 className="text-lg font-extrabold text-fg">
        What if no creators post, or my campaign gets no views?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-fg/70">
        Your campaign runs until its duration ends or its budget
        ends. Then it settles: a 3-day re-check, payouts for any
        approved clips, and the campaign is deleted 1 day after the
        last hold matures. If no creators posted, nothing was spent
        — any budget left unspent stays yours and is refunded on
        request, per the{" "}
        <Link href="/refund" className="font-bold text-lime hover:underline">
          Refund Policy
        </Link>
        . You never pay for views that were not verified.
      </p>
    </section>
  );

  const formSection = (
    <section id="brand-form">
      {!user ? (
        <div className="rounded-3xl border border-fg/10 bg-card p-8 text-center">
          <p className="text-4xl" aria-hidden>
            🏢
          </p>
          <h2 className="mt-3 text-xl font-black text-fg">
            Create a brand account to launch a campaign
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            Brands sign up with a brand name, email and password — then
            fill in the campaign form below.
          </p>
          <Link
            href="/signup?role=brand"
            className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Sign up as a brand
          </Link>
          <p className="mt-3 text-sm text-fg/60">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-lime hover:underline">
              Log in
            </Link>
          </p>
        </div>
      ) : !canLaunch ? (
        <div className="rounded-3xl border border-fg/10 bg-card p-8 text-center">
          <p className="text-4xl" aria-hidden>
            🎬
          </p>
          <h2 className="mt-3 text-xl font-black text-fg">
            You are signed in as a creator
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            Campaigns are launched from brand accounts. Browse funded
            campaigns to earn, or sign out first, then sign up as a
            brand to launch one.
          </p>
          <Link
            href="/campaigns"
            className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Browse campaigns
          </Link>
        </div>
      ) : (
        <BrandForm isLoggedIn initialBrandName={initialBrandName} />
      )}
    </section>
  );

  if (isBrand) {
    return (
      <div className="space-y-12">
        <section className="pt-4 text-center">
          <h1 className="font-display text-4xl font-black uppercase tracking-tight text-fg md:text-5xl">
            Launch a campaign
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-fg/70 md:text-base">
            Fund a budget and pay only for verified views. Your campaign
            goes live once payment is verified.
          </p>
        </section>
        {unpaidPending && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-5 py-4 text-sm leading-relaxed text-amber-200">
            <span className="font-black">
              You already have a pending campaign — fund it first.
            </span>{" "}
            <Link
              href={`/brands/payment/${unpaidPending.id}`}
              className="font-bold text-lime hover:underline"
            >
              &ldquo;{unpaidPending.title}&rdquo; is still waiting for
              payment →
            </Link>
          </div>
        )}
        {formSection}
        {howFunding}
        {benefit}
        {protection}
        {trust}
        {faq}
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {roleSplit}
      {howFunding}
      {benefit}
      {protection}
      {trust}
      {faq}
      {formSection}
    </div>
  );
}
