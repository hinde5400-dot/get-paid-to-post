import Link from "next/link";
import { BRAND_NAME } from "@/lib/constants";

const STEPS = [
  { n: "1", t: "Sign up free", d: "Create your account with email and password only. No phone, no address, no extra details." },
  { n: "2", t: "Connect your profiles", d: "Add your TikTok, Instagram and YouTube profile links so your clips can be matched to you." },
  { n: "3", t: "Pick a funded campaign", d: "Browse live campaigns, read the brief and the rate, and choose one that fits your style." },
  { n: "4", t: "Make your clip", d: "Film vertical 9:16, add captions, and hook viewers in the first 3 seconds. Keep it original and on-brief." },
  { n: "5", t: "Post and submit", d: "Post on TikTok and Instagram together (YouTube optional) and submit the links as one bundle, with proof and a short note on how you made it." },
  { n: "6", t: "Wait for approval", d: "Submissions stay Pending at $0 until approved. Approved earnings move into a 72-hour hold, then to your available balance." },
  { n: "7", t: "Withdraw your earnings", d: "Withdraw from $10 via USDT, Pakistani bank, or Wise. A 7% fee applies at withdrawal." },
];

export default function HowItWorksPage() {
  return (
    <div className="space-y-10">
      <div className="text-center">
        <h1 className="text-4xl font-black text-white">How It Works</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
          {BRAND_NAME} in seven simple steps — from signup to payout.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="rounded-2xl border border-white/10 bg-card p-5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sun text-lg font-black text-ink">
              {s.n}
            </span>
            <h2 className="mt-3 font-bold text-white">{s.t}</h2>
            <p className="mt-1 text-sm leading-relaxed text-white/60">{s.d}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-white">The money rules</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/70">
          <li>• Base pay: $10 per approved post.</li>
          <li>• View bonus: $0.75 per 1,000 views, tracked for 14 days.</li>
          <li>• Approved earnings sit in a 72-hour hold, then become available.</li>
          <li>• Minimum withdrawal: $10. Withdrawal fee: 7%.</li>
          <li>• Payouts: USDT, Pakistani bank, or Wise.</li>
          <li>• Brands fund every campaign upfront — minimum $500 to launch.</li>
          <li>• One clip per platform every 2 hours, max 7 posts per campaign.</li>
        </ul>
      </div>

      <div className="rounded-3xl border border-white/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-white">Video rules</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-white/70">
          <li>• Vertical video only — 9:16 format.</li>
          <li>• Add captions to your clip.</li>
          <li>• Hook viewers in the first 3 seconds.</li>
          <li>• Only TikTok, Instagram and YouTube links are accepted.</li>
          <li>• Fake engagement will lead to your account being strictly blocked or banned.</li>
        </ul>
      </div>

      <div className="text-center">
        <Link
          href="/signup"
          className="inline-block rounded-full bg-sun px-7 py-3.5 text-sm font-bold text-ink transition hover:bg-sundark"
        >
          Start earning — sign up free
        </Link>
      </div>
    </div>
  );
}
