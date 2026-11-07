import Link from "next/link";
import { getCampaigns } from "@/lib/data";
import CampaignCard from "@/components/CampaignCard";
import AdSlot from "@/components/AdSlot";
import Faq from "@/components/Faq";
import { BRAND_NAME } from "@/lib/constants";
import { formatUSD } from "@/lib/money";

const TOP_EARNERS = [
  { name: "Ayesha K.", platform: "TikTok", earned: 2840 },
  { name: "Liam R.", platform: "Instagram", earned: 2310 },
  { name: "Sofia M.", platform: "YouTube", earned: 1975 },
  { name: "Daniyal A.", platform: "TikTok", earned: 1640 },
  { name: "Emma W.", platform: "Instagram", earned: 1420 },
];

const FAQS = [
  {
    q: "How do I get paid?",
    a: "Pick a funded campaign, post your clip, and submit the link. Approved earnings go into a 72-hour hold, then move to your available balance. Withdraw from $10 via USDT, Pakistani bank, or Wise. A 7% fee applies at withdrawal.",
  },
  {
    q: "Do I need followers to join?",
    a: "No. There is no follower minimum. You are paid per view, so a small account with a great clip can earn just like a big one.",
  },
  {
    q: "How much can I earn per post?",
    a: "Every approved post earns a $10 base pay, plus $0.75 per 1,000 views. Featured campaigns pay up to $300 per post. Views are tracked for 14 days.",
  },
  {
    q: "What are the video rules?",
    a: "Vertical 9:16 video, captions on screen, and a hook in the first 3 seconds. Follow the campaign brief, and post only your own original content.",
  },
  {
    q: "How many posts can I submit?",
    a: "Up to 7 posts per campaign, and one clip per platform every 2 hours. Submit TikTok and Instagram together as one bundle; YouTube is optional.",
  },
  {
    q: "What happens with fake engagement?",
    a: "Fake engagement will lead to your account being strictly blocked or banned. Only real views from real people count.",
  },
];

export default async function HomePage() {
  const campaigns = await getCampaigns();
  const featured = campaigns[0];
  const rest = campaigns.slice(1, 7);

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="pt-6 text-center md:pt-10">
        <p className="inline-block rounded-full bg-sun/15 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-sun">
          TikTok · Instagram · YouTube
        </p>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-black leading-tight text-white md:text-6xl">
          Get Paid to Post on{" "}
          <span className="text-sun">TikTok, Instagram &amp; YouTube</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-white/70 md:text-lg">
          {BRAND_NAME} connects creators with brands. Post short clips, get
          paid per view. No follower minimum — a great clip is all you need.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/campaigns"
            className="rounded-full bg-sun px-7 py-3.5 text-sm font-bold text-ink transition hover:bg-sundark"
          >
            Browse campaigns
          </Link>
          <Link
            href="/brands"
            className="rounded-full border border-white/25 px-7 py-3.5 text-sm font-bold text-white transition hover:border-sun hover:text-sun"
          >
            I am a Brand
          </Link>
        </div>
        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { v: "8,100+", l: "Active creators" },
            { v: "$1.8M+", l: "Paid out to creators" },
            { v: "180+", l: "Countries" },
            { v: "4.72 ★", l: "Creator rating" },
          ].map((s) => (
            <div
              key={s.l}
              className="rounded-2xl border border-white/10 bg-card px-3 py-4"
            >
              <p className="text-xl font-black text-sun">{s.v}</p>
              <p className="mt-1 text-xs text-white/60">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured campaign */}
      {featured && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-extrabold text-white">
              ⭐ Featured Campaign
            </h2>
            <Link
              href="/campaigns"
              className="text-sm font-bold text-sun hover:underline"
            >
              View all →
            </Link>
          </div>
          <div className="overflow-hidden rounded-3xl border border-sun/40 bg-gradient-to-br from-card to-[#2A1B4A] p-6 md:p-8">
            <p className="text-xs font-bold uppercase tracking-widest text-sun">
              {featured.brand_name} · {featured.category}
            </p>
            <h3 className="mt-2 max-w-xl text-2xl font-black text-white md:text-3xl">
              {featured.title}
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">
              {featured.description}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs text-white/50">Earn up to</p>
                <p className="text-3xl font-black text-sun">
                  {formatUSD(featured.earn_up_to)}
                  <span className="text-base font-semibold text-white/60"> / post</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-white/50">Base pay</p>
                <p className="text-lg font-bold text-white">
                  {formatUSD(featured.base_pay)} per approved post
                </p>
              </div>
              <div>
                <p className="text-xs text-white/50">View bonus</p>
                <p className="text-lg font-bold text-white">
                  {formatUSD(featured.view_bonus_per_1k)} per 1K views
                </p>
              </div>
            </div>
            <Link
              href={`/campaign/${featured.id}`}
              className="mt-6 inline-block rounded-full bg-sun px-7 py-3 text-sm font-bold text-ink transition hover:bg-sundark"
            >
              View campaign &amp; submit
            </Link>
          </div>
        </section>
      )}

      {/* Campaign list */}
      <section>
        <h2 className="mb-4 text-2xl font-extrabold text-white">
          Active campaigns
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rest.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      </section>

      <AdSlot />

      {/* How it works */}
      <section>
        <h2 className="mb-6 text-center text-2xl font-extrabold text-white">
          How It Works
        </h2>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { n: "1", t: "Sign up free", d: "Create your account with email and password only. Then connect your TikTok, Instagram and YouTube profiles." },
            { n: "2", t: "Pick a campaign", d: "Browse funded campaigns and choose one that fits your style. Check the brief, rate and rules first." },
            { n: "3", t: "Post your clip", d: "Film a vertical 9:16 clip with captions and a hook in the first 3 seconds. Post it, then submit the link." },
            { n: "4", t: "Get paid per view", d: "Approved earnings sit in a 72-hour hold, then land in your wallet. Withdraw from $10 via USDT, bank or Wise." },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-white/10 bg-card p-5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sun text-lg font-black text-ink">
                {s.n}
              </span>
              <h3 className="mt-3 font-bold text-white">{s.t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-white/60">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why */}
      <section>
        <h2 className="mb-6 text-center text-2xl font-extrabold text-white">
          Why creators choose {BRAND_NAME}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { t: "No follower minimum", d: "Small accounts earn the same per view as big ones. Your clip matters, not your follower count." },
            { t: "Paid per real view", d: "$10 base pay per approved post, plus $0.75 per 1,000 views, tracked for 14 days." },
            { t: "Funded budgets only", d: "Every live campaign is funded upfront by the brand, so approved earnings are always covered." },
          ].map((s) => (
            <div
              key={s.t}
              className="rounded-2xl border border-white/10 bg-card p-5"
            >
              <h3 className="font-bold text-white">{s.t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-white/60">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Top earners */}
      <section>
        <h2 className="mb-4 text-2xl font-extrabold text-white">Top Earners</h2>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
          {TOP_EARNERS.map((e, i) => (
            <div
              key={e.name}
              className="flex items-center justify-between border-b border-white/5 px-5 py-3.5 last:border-0"
            >
              <span className="flex items-center gap-3 text-sm font-bold text-white">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sun/15 font-black text-sun">
                  {i + 1}
                </span>
                {e.name}
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                  {e.platform}
                </span>
              </span>
              <span className="text-sm font-black text-sun">
                {formatUSD(e.earned)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="mb-4 text-2xl font-extrabold text-white">
          Frequently asked questions
        </h2>
        <Faq items={FAQS} />
      </section>

      <section className="rounded-3xl bg-sun p-8 text-center">
        <h2 className="text-2xl font-black text-ink md:text-3xl">
          Ready to get paid for your clips?
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm font-medium text-ink/70">
          Sign up free, connect your profiles, and post your first clip today.
        </p>
        <Link
          href="/signup"
          className="mt-5 inline-block rounded-full bg-ink px-7 py-3 text-sm font-bold text-white"
        >
          Create your free account
        </Link>
      </section>
    </div>
  );
}
