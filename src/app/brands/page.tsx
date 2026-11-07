import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import BrandForm from "@/components/BrandForm";
import { BRAND_MIN_BUDGET } from "@/lib/constants";

const FUNDING_STEPS = [
  { n: "1", t: "Create your campaign", d: "Fill in the form below: brand, logo, title, rate per 1K views, budget and brief." },
  { n: "2", t: "Your campaign is saved as pending", d: "Nothing goes live yet. The admin reviews it, and it goes live only after the budget is funded." },
  { n: "3", t: "Agree the rate and budget", d: "The platform owner confirms the rate and the total budget with you." },
  { n: "4", t: "Fund the budget upfront", d: "Send the budget directly to the platform owner via USDT, Pakistani bank, or Wise." },
  { n: "5", t: "Campaign goes live", d: "Once funding is confirmed, your campaign opens to creators on TikTok, Instagram and YouTube." },
  { n: "6", t: "Creators post and submit", d: "Creators post short vertical clips, submit their links, and earn per view." },
  { n: "7", t: "You pay only for verified views", d: "Approved views are paid from your funded budget. Unspent budget stays yours." },
];

export default async function BrandsPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-12">
      {/* Role split */}
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
            <p className="text-3xl">🏢</p>
            <h2 className="mt-2 text-xl font-extrabold text-fg">
              I am a Brand
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-fg/60">
              Upload your brand and campaign below. Fund from $
              {BRAND_MIN_BUDGET} upfront and pay only for verified views.
            </p>
            <a
              href="#brand-form"
              className="mt-4 inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-ink"
            >
              Create a campaign
            </a>
          </div>
          <div className="rounded-3xl border border-fg/10 bg-card p-6 text-left">
            <p className="text-3xl">🎬</p>
            <h2 className="mt-2 text-xl font-extrabold text-fg">
              I am a Creator
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-fg/60">
              Pick a funded campaign, make a clip per the brief, post it, and
              get paid per view.
            </p>
            <Link
              href="/campaigns"
              className="mt-4 inline-block rounded-full border border-fg/25 px-5 py-2.5 text-sm font-bold text-fg hover:border-lime hover:text-lime"
            >
              Browse campaigns
            </Link>
          </div>
        </div>
      </section>

      {/* How funding works */}
      <section>
        <h2 className="mb-6 text-center text-2xl font-extrabold text-fg">
          How Funding Works — 7 steps
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
              Minimum budget: ${BRAND_MIN_BUDGET}
            </p>
            <p className="mt-1 text-sm font-medium text-ink/70">
              A campaign only goes live after its budget is funded. Unspent
              budget stays the brand&apos;s.
            </p>
          </div>
        </div>
      </section>

      {/* Benefit & risk */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-fg/10 bg-card p-6">
          <h2 className="text-lg font-extrabold text-fg">
            Why brands use Get Paid To Post
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg/70">
            <li>• Real creators, no follower minimum.</li>
            <li>• You pay only for verified views — never per post alone.</li>
            <li>• Every campaign budget is funded upfront.</li>
            <li>• Every clip comes with proof, so you can see what ran.</li>
            <li>• Unspent budget stays yours.</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-fg/10 bg-card p-6">
          <h2 className="text-lg font-extrabold text-fg">
            How your budget is protected
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg/70">
            <li>• Budgets are kept separate from operating money.</li>
            <li>• Payouts go only to approved views, from your funded budget.</li>
            <li>• Every payout is recorded and can be shown to you.</li>
            <li>• Fake engagement will lead to the creator&apos;s account being strictly blocked or banned.</li>
          </ul>
        </div>
      </section>

      {/* Brand form */}
      <section id="brand-form">
        <BrandForm isLoggedIn={Boolean(user)} />
      </section>
    </div>
  );
}
