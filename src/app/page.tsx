import Link from "next/link";
import { getCampaigns, getCampaignStatsMap } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import CampaignGrid from "@/components/CampaignGrid";
import CampaignBanner from "@/components/CampaignBanner";
import AdSlot from "@/components/AdSlot";
import Faq from "@/components/Faq";
import DiscordButton from "@/components/DiscordButton";
import RoleCards from "@/components/RoleCards";
import { formatUSD } from "@/lib/money";

const FAQS = [
  {
    q: "How do I get paid?",
    a: "Pick a funded campaign, post your clip, and submit the link. Approved earnings go into a 72-hour hold, then move to your available balance. Withdraw from $15 in USDT (TRC20 or BEP20). A 5% fee applies at withdrawal.",
  },
  {
    q: "Do I need followers to join?",
    a: "No. There is no follower minimum. You are paid per view, so a small account with a great clip can earn just like a big one.",
  },
  {
    q: "How much can I earn per post?",
    a: "Every approved post earns the campaign's rate per 1,000 verified views — there is no base pay per post. Each campaign also sets a maximum payout per post — shown on its card as 'Up to $X per post' — so a viral clip never pays more than the cap. Views are tracked for 14 days.",
  },
  {
    q: "What are the video rules?",
    a: "Vertical 9:16 video, captions on screen, and a hook in the first 3 seconds. Follow the campaign brief, and post only your own original content.",
  },
  {
    q: "How many posts can I submit?",
    a: "Up to 15 approved clips per platform per campaign, and one clip per platform every 2 hours. Submit any 2 of TikTok, Instagram and YouTube together as one bundle. Rejected clips don't count toward the 15-clip limit.",
  },
  {
    q: "What happens with fake engagement?",
    a: "Fake engagement will lead to your account being strictly blocked or banned. Only real views from real people count.",
  },
  {
    q: "Is Get Paid To Post safe?",
    a: "Yes. Every campaign is funded by the brand before it goes live, creators are paid only for verified views, and creators never pay anything to join, post, or earn. The site runs over secure HTTPS, and support is available on Discord.",
  },
  {
    q: "What happens to my unspent budget?",
    a: "It stays yours. Your budget is funded before your campaign goes live, creators are paid only for verified views at the rate you set, and any budget left unspent when your campaign ends remains yours. We never spend your budget on anything else.",
  },
  {
    q: "What if my clip is rejected by mistake?",
    a: "You can appeal once through Discord support. A person will review your appeal and reply within 10 business days. Earnings that have already settled to your Withdrawable Balance are never reversed; only unsettled earnings can be returned to the campaign budget.",
  },
  {
    q: "Do you guarantee views or earnings?",
    a: "No. We do not guarantee any number of views, earnings, or campaign availability. Earnings depend on the verified views your clips receive and on the campaign's remaining budget.",
  },
];

export default async function HomePage() {
  const campaigns = await getCampaigns();
  const featured = campaigns[0];
  const rest = campaigns.slice(1, 7);
  const stats = await getCampaignStatsMap(rest.map((c) => c.id));
  const user = await getCurrentUser();

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="pt-6 text-center md:pt-10">
        <p className="inline-block rounded-full bg-lime px-4 py-1.5 text-xs font-black uppercase tracking-widest text-black">
          TikTok · Instagram · YouTube
        </p>
        <div className="mt-4 flex justify-center">
          <DiscordButton compact />
        </div>
        <h1 className="mx-auto mt-5 max-w-3xl font-display text-5xl font-black uppercase leading-[0.95] tracking-tight text-fg md:text-7xl">
          Post Clips. <span className="bg-lime px-2 text-black">Get Paid Per View.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-fg/70 md:text-lg">
          Post short clips, get paid per view. No follower minimum — a great
          clip is all you need.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <>
              <Link
                href="/campaigns"
                className="rounded-full bg-lime px-7 py-3.5 text-sm font-black text-black transition hover:bg-limedark"
              >
                Browse Campaigns
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border border-fg/25 px-7 py-3.5 text-sm font-bold text-fg transition hover:border-lime hover:text-lime"
              >
                Go to Dashboard
              </Link>
            </>
          ) : (
            <Link
              href="/campaigns"
              className="rounded-full border border-fg/25 px-7 py-3.5 text-sm font-bold text-fg transition hover:border-lime hover:text-lime"
            >
              Browse campaigns
            </Link>
          )}
        </div>
        {/* Guest signup entry — ONLY the two role cards, no other
            signup button. */}
        {!user && (
          <div className="mx-auto mt-8 max-w-2xl">
            <RoleCards />
          </div>
        )}
        <p className="mt-8 text-sm font-bold text-fg/50">
          <span className="font-black text-lime">
            {campaigns.length} live campaign{campaigns.length === 1 ? "" : "s"}
          </span>
          {" · "}Every live campaign is funded upfront by the brand
        </p>
      </section>

      {/* Featured campaign */}
      {featured && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl font-black uppercase tracking-tight text-fg">
              Featured Campaign
            </h2>
            <Link
              href="/campaigns"
              className="text-sm font-bold text-lime hover:underline"
            >
              View all →
            </Link>
          </div>
          <div className="overflow-hidden rounded-3xl border border-lime/40 bg-card">
            <CampaignBanner
              campaign={featured}
              size="lg"
              badge={`Up to ${formatUSD(featured.max_payout_per_post)} per post`}
            />
            <div className="p-6 md:p-8">
              <h3 className="max-w-xl font-display text-2xl font-black tracking-tight text-fg md:text-3xl">
                {featured.title}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg/70">
                {featured.description}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-xs text-fg/50">Earn up to</p>
                  <p className="font-display text-3xl font-black text-lime">
                    {formatUSD(featured.max_payout_per_post)}
                    <span className="text-base font-semibold text-fg/60"> / post</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg/50">View bonus</p>
                  <p className="text-lg font-bold text-fg">
                    {formatUSD(featured.view_bonus_per_1k)} per 1K views
                  </p>
                </div>
              </div>
              <Link
                href={`/campaign/${featured.id}`}
                className="mt-6 inline-block rounded-full bg-lime px-7 py-3 text-sm font-black text-black transition hover:bg-limedark"
              >
                View campaign &amp; submit
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Campaign list / empty state */}
      <section>
        <h2 className="mb-4 font-display text-2xl font-black uppercase tracking-tight text-fg">
          Active campaigns
        </h2>
        {campaigns.length === 0 ? (
          <div className="rounded-3xl border border-fg/10 bg-card p-10 text-center">
            <p className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-lime/15 text-3xl">
              📣
            </p>
            <p className="mt-4 font-display text-2xl font-black uppercase tracking-tight text-fg">
              No Live Campaigns Yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
              New campaigns from brands will appear here soon. Check back
              later.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/how-it-works"
                className="rounded-full border border-fg/25 px-6 py-3 text-sm font-bold text-fg transition hover:border-lime hover:text-lime"
              >
                How it works
              </Link>
            </div>
          </div>
        ) : (
          <CampaignGrid campaigns={rest} stats={stats} />
        )}
      </section>

      <AdSlot />

      {/* How it works */}
      <section>
        <h2 className="mb-6 text-center font-display text-2xl font-black uppercase tracking-tight text-fg">
          How It Works
        </h2>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { n: "1", t: "Sign up free", d: "Create your account with email and password only. Then connect your TikTok, Instagram and YouTube profiles." },
            { n: "2", t: "Pick a campaign", d: "Browse funded campaigns and choose one that fits your style. Check the brief, rate and rules first." },
            { n: "3", t: "Post your clip", d: "Film a vertical 9:16 clip with captions and a hook in the first 3 seconds. Post it, then submit the link." },
            { n: "4", t: "Get paid per view", d: "Approved earnings sit in a 72-hour hold, then land in your wallet. Withdraw from $15 in USDT (TRC20 or BEP20)." },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-fg/10 bg-card p-5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime font-display text-lg font-black text-black">
                {s.n}
              </span>
              <h3 className="mt-3 font-display font-black tracking-tight text-fg">{s.t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-fg/60">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="mb-4 font-display text-2xl font-black uppercase tracking-tight text-fg">
          Frequently asked questions
        </h2>
        <Faq items={FAQS} />
      </section>
    </div>
  );
}
