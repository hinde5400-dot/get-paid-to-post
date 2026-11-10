import Link from "next/link";
import { BRAND_NAME } from "@/lib/constants";
import { getCurrentUser } from "@/lib/auth";

const STEPS = [
  { n: "1", t: "Sign up free", d: "Create your account with email and password. No phone, no address, no extra details." },
  { n: "2", t: "Connect your profiles", d: "Connect your TikTok and YouTube accounts (Instagram connects later) so your clips can be matched to you." },
  { n: "3", t: "Pick a funded campaign", d: "Browse live campaigns, read the brief and the rate, and choose one that fits your style." },
  { n: "4", t: "Make your clip", d: "Film vertical 9:16, add captions, and hook viewers in the first 3 seconds. Keep it original and on-brief." },
  { n: "5", t: "Post and submit", d: "Post on the campaign's platforms and submit the links as one bundle, with proof and a short note on how you made it. Submit your link within 30 minutes of posting — Instagram links are hand-checked by the admin." },
  { n: "6", t: "Wait for approval", d: "Submissions stay Pending at $0 until approved. Approved earnings move into a 72-hour hold starting at approval, then to your available balance." },
  { n: "7", t: "Withdraw your earnings", d: "Withdraw from $15 in USDT (TRC20 only). A 5% fee applies at withdrawal." },
];

export default async function HowItWorksPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-10">
      <div className="text-center">
        <h1 className="font-display text-4xl font-black uppercase tracking-tight text-fg">How It Works</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-fg/70">
          {BRAND_NAME} in seven simple steps — from signup to payout.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="rounded-2xl border border-fg/10 bg-card p-5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime text-lg font-black text-ink">
              {s.n}
            </span>
            <h2 className="mt-3 font-bold text-fg">{s.t}</h2>
            <p className="mt-1 text-sm leading-relaxed text-fg/60">{s.d}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">The money rules</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• Earnings are views only — you are paid the campaign&apos;s rate per 1,000 verified views, up to the per-post cap. There is no base pay per post.</li>
          <li>• One rate per 1,000 views for the whole campaign — the same rate on TikTok, Instagram and YouTube.</li>
          <li>• Maximum payout per post: set by the brand, $10–$200; $100 when the brand does not set one.</li>
          <li>• View bonus: the campaign&apos;s rate per 1,000 views, tracked for 14 days.</li>
          <li>• Every clip needs at least 1,000 views to earn — a clip below 1,000 views cannot be approved. A brand may set a higher minimum for its campaign.</li>
          <li>• Every clip needs at least 1% engagement — (likes + comments) / views. Shares and saves never count.</li>
          <li>• Submit your link within 30 minutes of posting — Instagram links are hand-checked by the admin (no automatic check yet).</li>
          <li>• Approved earnings sit in a 72-hour hold starting at approval, then become available.</li>
          <li>• Minimum withdrawal: $15. Withdrawal fee: 5%.</li>
          <li>• Payouts: USDT (TRC20) only.</li>
          <li>• Brands fund every campaign upfront — any budget, set by the brand.</li>
          <li>• One clip per platform every 2 hours, across all campaigns on that platform — a rejected or duplicate submission does not start the cooldown. Up to 15 approved clips per platform. A rejected clip cannot be resubmitted — post a new clip.</li>
          <li>• Bot-view rejections add up: 6 = concern, 10 = flagged, one more bot-view rejection after the flag = the account is banned automatically. Every rejection shows its reason.</li>
          <li>• The campaign, its proofs and its chat are deleted 1 day after the last hold matures, never earlier than 7 days after the campaign ends. Wallet and withdrawal records are never deleted.</li>
        </ul>
      </div>

      <div className="rounded-3xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">When do I get paid?</h2>
        <p className="mt-3 text-sm leading-relaxed text-fg/70">
          Approved earnings enter a 72-hour hold as soon as they are
          approved — even while the campaign is still running. After a
          campaign ends, the settlement timeline is:
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• <strong className="text-fg">Campaign ends → 3-day re-check window.</strong> We review suspicious videos, and an already-approved video can still be rejected if fake or bot views show up.</li>
          <li>• <strong className="text-fg">Then payout.</strong> Payouts are made manually — withdraw in USDT (TRC20 only) from $15. From campaign end to payout: about 1 week in total.</li>
          <li>• <strong className="text-fg">Then auto-delete.</strong> The campaign, its proofs and its chat are deleted 1 day after the last hold matures, never earlier than 7 days after the campaign ends. Wallet and withdrawal records are never deleted.</li>
        </ul>
      </div>

      <div className="rounded-3xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">Video rules</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• Vertical video only — 9:16 format.</li>
          <li>• Add captions to your clip.</li>
          <li>• Hook viewers in the first 3 seconds.</li>
          <li>• Only TikTok, Instagram and YouTube links are accepted.</li>
          <li>• Fake engagement will lead to your account being strictly blocked or banned.</li>
        </ul>
      </div>

      <div className="text-center">
        <Link
          href="/rules"
          className="text-sm font-bold text-lime hover:underline"
        >
          Read the full rules →
        </Link>
        <div className="mt-4">
        {user ? (
          <Link
            href="/campaigns"
            className="inline-block rounded-full bg-lime px-7 py-3.5 text-sm font-bold text-ink transition hover:bg-limedark"
          >
            Browse campaigns
          </Link>
        ) : (
          <Link
            href="/signup"
            className="inline-block rounded-full bg-lime px-7 py-3.5 text-sm font-bold text-ink transition hover:bg-limedark"
          >
            Start earning — sign up free
          </Link>
        )}
        </div>
      </div>
    </div>
  );
}
