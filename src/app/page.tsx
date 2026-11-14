import type { Metadata } from "next";
import Link from "next/link";
import {
  campaignStatus,
  getBrandCampaigns,
  getDiscoverCampaigns,
  getCampaignStatsMap,
  isCampaignLive,
} from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { getModeContext } from "@/lib/mode";
import { DISCORD_URL } from "@/lib/constants";
import CampaignGrid from "@/components/CampaignGrid";

export const metadata: Metadata = {
  title: "Get Paid to Post on TikTok, Instagram & YouTube",
  description:
    "Post short clips on TikTok, Instagram and YouTube and get paid per verified view. No follower minimum — every live campaign is funded upfront by the brand.",
};
import CampaignBanner from "@/components/CampaignBanner";
import Faq from "@/components/Faq";
import DiscordButton from "@/components/DiscordButton";
import RoleCards from "@/components/RoleCards";
import { budgetUsedPct, formatUSD, rateRangeText } from "@/lib/money";
import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "@/lib/types";

const PENDING_EXPIRY_DAYS = 7;

/** When an unpaid pending campaign expires (created + 7 days). */
function pendingExpiryText(createdAt?: string | null): string | null {
  if (!createdAt) return null;
  const d = new Date(new Date(createdAt).getTime() + PENDING_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const FAQS = [
  {
    q: "How do I get paid?",
    a: "Pick a funded campaign, post your clip, and submit the link. Approved earnings go into a 72-hour hold, then move to your available balance. Withdraw from $15 in USDT (TRC20 only). A 5% fee applies at withdrawal.",
  },
  {
    q: "When do I get paid after a campaign ends?",
    a: "Approved earnings enter a 72-hour hold as soon as they are approved — even while the campaign is still running. After the campaign ends there is a 3-day re-check window, during which an already-approved video can still be rejected if fake or bot views show up. Then payouts are made manually — about 1 week after the campaign ends in total. The campaign, its proofs and its chat are deleted 1 day after the last hold matures, never earlier than 7 days after the campaign ends. Wallet and withdrawal records are never deleted.",
  },
  {
    q: "Do I need followers to join?",
    a: "No. There is no follower minimum. You are paid per view, so a small account with a great clip can earn just like a big one.",
  },
  {
    q: "How much can I earn per post?",
    a: "Every approved post earns the campaign's rate per 1,000 verified views — there is no base pay per post. The campaign sets ONE rate per 1,000 views for the whole campaign — the same rate on TikTok, Instagram and YouTube. Every clip needs at least 1,000 views to earn — a brand may set a higher minimum, shown on the campaign. A clip below the campaign's minimum cannot be approved. Each campaign also sets a maximum payout per post — shown on its card as 'Up to $X per post' — so a viral clip never pays more than the cap. Views are tracked while your clip is pending, for up to 14 days after you submit. Once approved, earnings are fixed on the views at approval — later views don't add earnings.",
  },
  {
    q: "What are the video rules?",
    a: "Vertical 9:16 video, captions on screen, and a hook in the first 3 seconds. Follow the campaign brief, and post only your own original content. Submit your link within 30 minutes of posting — Instagram links are hand-checked by the admin (no automatic check yet). Every clip needs at least 1% engagement (likes + comments only — shares and saves never count). Fake engagement will lead to your account being strictly blocked or banned.",
  },
  {
    q: "How many posts can I submit?",
    a: "Up to 15 approved clips per platform per campaign, and one clip per platform every 2 hours — the cooldown applies across all campaigns on that platform, not per campaign. A rejected or duplicate submission does not start the cooldown. Submit up to 2 links together as one bundle (a single-platform campaign needs only 1 link). Rejected clips don't count toward the 15-clip limit, and a rejected clip cannot be resubmitted — post a new clip instead.",
  },
  {
    q: "What happens with fake engagement?",
    a: "Fake engagement will lead to your account being strictly blocked or banned. Only real views from real people count.",
  },
  {
    q: "Is Get Paid To Post safe?",
    a: "We make no guarantee of safety — here is how it works instead. Every campaign is funded by the brand before it goes live, creators are paid only for verified views, and creators never pay anything to join, post, or earn. Views are checked through the platforms' own data where available (TikTok and YouTube) and reviewed by hand; Instagram views are checked by hand only — there is no automatic Instagram check yet. Fake engagement leads to an account being strictly blocked or banned. Support runs on Discord.",
  },
  {
    q: "What happens to my unspent budget?",
    a: "It stays yours. Your budget is funded before your campaign goes live, creators are paid only for verified views at the rate you set, and any budget left unspent when your campaign ends remains yours. We never spend your budget on anything else.",
  },
  {
    q: "What if my clip is rejected by mistake?",
    a: "If you think a rejection or flag was wrong, appeal through Discord support. A person will review your appeal. We aim to reply within 10 business days. If a submission is rejected after it was approved, its earnings are reversed — taken back from your Pending Balance first, then from your Withdrawable Balance — and returned to the campaign budget. Only amounts already withdrawn (paid out) cannot be reversed.",
  },
  {
    q: "What happens after a campaign ends?",
    a: "About 1 week after the campaign ends. Approved earnings already entered a 72-hour hold as soon as they were approved — even while the campaign was still running. After the campaign ends there is a 3-day re-check window, during which an already-approved video can still be rejected if fake or bot views show up. Then payouts are made manually. The campaign, its proofs and its chat are deleted 1 day after the last hold matures, never earlier than 7 days after the campaign ends. Wallet and withdrawal records are never deleted.",
  },
  {
    q: "Do you guarantee views or earnings?",
    a: "No. We do not guarantee any number of views, earnings, or campaign availability. Earnings depend on the verified views your clips receive and on the campaign's remaining budget.",
  },
];

/**
 * Brand home — a brand's own campaigns, funding status and a
 * Launch Campaign call to action. NEVER an earning pitch: a brand
 * does not come here to earn, it comes to launch campaigns and get
 * clips made.
 */
async function BrandHome({
  user,
  profile,
}: {
  user: User;
  profile: UserProfile;
}) {
  // Forms #26: getBrandCampaigns THROWS on DB error — a failed load
  // renders an honest error state, never an empty "no campaigns" view.
  let campaigns: Awaited<ReturnType<typeof getBrandCampaigns>>;
  try {
    campaigns = await getBrandCampaigns(user.id);
  } catch {
    return (
      <div className="space-y-10">
        <section className="pt-4 text-center md:pt-10">
          <div className="rounded-3xl border border-red-500/40 bg-card p-10 text-center">
            <p className="font-display text-2xl font-black uppercase tracking-tight text-fg">
              Couldn&apos;t load your campaigns
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
              Your campaigns could not be loaded — please try again.
              Your data is safe; this is a loading problem, not an
              empty list.
            </p>
            <a
              href="/"
              className="mt-6 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
            >
              Try again
            </a>
          </div>
        </section>
      </div>
    );
  }
  const displayName =
    profile.brand_name ?? profile.full_name ?? user.email ?? "Brand";
  const liveCount = campaigns.filter(
    (c) => campaignStatus(c) === "live"
  ).length;
  const pendingCount = campaigns.filter(
    (c) => c.status === "pending"
  ).length;
  const needsFunding = campaigns.filter(
    (c) => c.status === "pending" && !c.is_funded
  ).length;

  return (
    <div className="space-y-10">
      <section className="pt-4 text-center md:pt-10">
        <p className="inline-block rounded-full bg-lime px-4 py-1.5 text-xs font-black uppercase tracking-widest text-black">
          For Brands
        </p>
        <h1 className="mx-auto mt-5 max-w-3xl font-display text-[2.1rem] font-black uppercase leading-[1.05] tracking-tight text-fg md:text-7xl">
          Launch a campaign. <span className="text-limeink">Get clips made.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-fg/70 md:text-lg">
          Welcome back, {displayName}. Fund a budget, set your rate,
          and real creators post clips about your brand — you pay only
          for verified views.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/brands"
            className="rounded-full bg-lime px-7 py-3.5 text-sm font-black text-black transition hover:bg-limedark"
          >
            + Launch a campaign
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-fg/25 px-7 py-3.5 text-sm font-bold text-fg transition hover:border-lime hover:text-limeink"
          >
            See pricing
          </Link>
        </div>
        <p className="mt-8 text-sm font-bold text-fg/50">
          <span className="font-black text-limeink">
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
          </span>
          {" · "}
          {liveCount} live{" · "}{pendingCount} pending
          {needsFunding > 0 && (
            <>
              {" · "}
              <span className="font-black text-amber-300">
                {needsFunding} need{needsFunding === 1 ? "s" : ""} funding
              </span>
            </>
          )}
        </p>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-black uppercase tracking-tight text-fg">
          Your campaigns
        </h2>
        {campaigns.length === 0 ? (
          <div className="rounded-3xl border border-fg/10 bg-card p-6 text-center md:p-10">
            <p className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-lime/15 text-3xl">
              🏢
            </p>
            <p className="mt-4 font-display text-2xl font-black uppercase tracking-tight text-fg">
              You haven&apos;t launched a campaign yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
              Fund a budget and pay only for verified views. Your
              campaign goes live once payment is verified.
            </p>
            <Link
              href="/brands"
              className="mt-6 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
            >
              Create your first campaign
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((c) => {
              const status = campaignStatus(c);
              const usedPct = budgetUsedPct(c.budget_total, c.budget_left);
              const pill =
                status === "live"
                  ? "bg-lime/15 text-limeink"
                  : status === "settling"
                    ? "bg-fg/10 text-fg/60"
                    : c.status === "rejected"
                      ? "bg-red-500/15 text-red-300"
                      : "bg-yellow-500/15 text-yellow-300";
              const label =
                status === "live"
                  ? "Live"
                  : status === "settling"
                    ? "Ended"
                    : c.status === "rejected"
                      ? "Rejected"
                      : "Pending";
              const expiry =
                c.status === "pending" && !c.is_funded
                  ? pendingExpiryText(c.created_at)
                  : null;
              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-fg/10 bg-card p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-display text-lg font-black text-fg">
                          {c.title}
                        </h3>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-black ${pill}`}
                        >
                          {label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-fg/60">
                        {formatUSD(c.view_bonus_per_1k)} per 1k views ·{" "}
                        {usedPct}% budget used
                      </p>
                      {expiry && (
                        <p className="mt-1 text-xs font-bold text-amber-300">
                          Unpaid pending campaigns expire after 7 days
                          {expiry ? ` — this one expires ${expiry}` : ""}.
                          Chatting alone does not count as payment.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {c.status === "pending" && !c.is_funded && (
                        <Link
                          href={`/brands/payment/${c.id}`}
                          className="rounded-full bg-lime px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:bg-limedark"
                        >
                          Fund this campaign
                        </Link>
                      )}
                      <Link
                        href={`/campaign/${c.id}`}
                        className="rounded-full border border-fg/20 px-4 py-2 text-xs font-bold text-fg hover:border-lime hover:text-limeink"
                      >
                        View campaign
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-lime/40 bg-card p-6 text-center md:p-8">
        <h2 className="text-xl font-extrabold text-fg">
          How brand funds are protected
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-fg/70">
          Your budget is funded before your campaign goes live. Creators
          are paid only for verified views at the rate you set — never
          for promises. Unspent budget stays yours.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/pricing"
            className="text-sm font-bold text-limeink hover:underline"
          >
            See full pricing →
          </Link>
          <Link
            href="/rules#brands"
            className="text-sm font-bold text-limeink hover:underline"
          >
            Rules for brands →
          </Link>
        </div>
      </section>
    </div>
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();
  // Mode (not role) decides the home: a creator who switched to
  // brand mode gets the brand home, and a brand who switched to
  // creator mode gets the creator home — strict mode separation
  // (Turn 2026-11-14). Guests always get the creator home.
  const { mode, profile } = await getModeContext();
  // Brands get their own home: their campaigns and funding status —
  // never an earning pitch. A brand does not come here to earn.
  if (user && mode === "brand" && profile) {
    return <BrandHome user={user} profile={profile} />;
  }
  // Forms #26: getDiscoverCampaigns THROWS on DB error — a failed load
  // renders an honest error state, never the "No Live Campaigns
  // Yet" empty state.
  // P2-R11: home uses the SAME loader as /campaigns (live +
  // settling) — the old live-only getCampaigns() made home say
  // "0 live campaigns" the moment a campaign ended while Discover
  // still listed it. The count below splits live / completed so
  // the hero line stays honest.
  let campaigns: Awaited<ReturnType<typeof getDiscoverCampaigns>>;
  try {
    campaigns = await getDiscoverCampaigns();
  } catch {
    return (
      <div className="space-y-14">
        <section className="pt-4 text-center md:pt-10">
          <div className="rounded-3xl border border-red-500/40 bg-card p-10 text-center">
            <p className="font-display text-2xl font-black uppercase tracking-tight text-fg">
              Couldn&apos;t load campaigns
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
              Campaigns could not be loaded — please try again.
            </p>
            <a
              href="/"
              className="mt-6 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
            >
              Try again
            </a>
          </div>
        </section>
      </div>
    );
  }
  const featured = campaigns[0];
  const rest = campaigns.slice(1, 7);
  const stats = await getCampaignStatsMap(rest.map((c) => c.id));
  const liveCount = campaigns.filter((c) => isCampaignLive(c)).length;
  const settlingCount = campaigns.length - liveCount;

  return (
    <div className="space-y-10 md:space-y-14">
      {/* Hero */}
      <section className="pt-4 text-center md:pt-10">
        <p className="inline-block rounded-full bg-lime px-4 py-1.5 text-xs font-black uppercase tracking-widest text-black">
          TikTok · Instagram · YouTube
        </p>
        <div className="mt-4 flex justify-center">
          <DiscordButton compact />
        </div>
        <h1 className="mx-auto mt-5 max-w-3xl font-display text-[2.1rem] font-black uppercase leading-[1.05] tracking-tight text-fg md:text-7xl">
          Post Clips. <span className="text-limeink">Get Paid Per View.</span>
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
                className="rounded-full border border-fg/25 px-7 py-3.5 text-sm font-bold text-fg transition hover:border-lime hover:text-limeink"
              >
                Go to Dashboard
              </Link>
            </>
          ) : (
            <Link
              href="/campaigns"
              className="rounded-full border border-fg/25 px-7 py-3.5 text-sm font-bold text-fg transition hover:border-lime hover:text-limeink"
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
          <span className="font-black text-limeink">
            {liveCount} live campaign{liveCount === 1 ? "" : "s"}
          </span>
          {settlingCount > 0 && (
            <>
              {" · "}
              {settlingCount} completed
            </>
          )}
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
              className="text-sm font-bold text-limeink hover:underline"
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
                  <p className="font-display text-3xl font-black text-limeink">
                    {formatUSD(featured.max_payout_per_post)}
                    <span className="text-base font-semibold text-fg/60"> / post</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg/50">View bonus</p>
                  <p className="text-lg font-bold text-fg">
                    {rateRangeText(featured)}
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
          <div className="rounded-3xl border border-fg/10 bg-card p-6 text-center md:p-10">
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
            {/* Same three next actions as Discover's empty state —
                a zero-campaign home is not a dead end. */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/connect"
                className="rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
              >
                Connect your accounts first
              </Link>
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-fg/25 px-6 py-3 text-sm font-bold text-fg transition hover:border-lime hover:text-limeink"
              >
                Join Discord for announcements
              </a>
              <Link
                href="/how-it-works"
                className="rounded-full border border-fg/25 px-6 py-3 text-sm font-bold text-fg transition hover:border-lime hover:text-limeink"
              >
                How it works
              </Link>
            </div>
          </div>
        ) : (
          <CampaignGrid campaigns={rest} stats={stats} />
        )}
      </section>

      {/* How it works */}
      <section>
        <h2 className="mb-6 text-center font-display text-2xl font-black uppercase tracking-tight text-fg">
          How It Works
        </h2>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { n: "1", t: "Sign up free", d: "Create your account with email and password. Then connect your TikTok and YouTube accounts and add your Instagram profile link." },
            { n: "2", t: "Pick a campaign", d: "Browse funded campaigns and choose one that fits your style. Check the brief, rate and rules first." },
            { n: "3", t: "Post your clip", d: "Film a vertical 9:16 clip with captions and a hook in the first 3 seconds. Post it, then submit the link." },
            { n: "4", t: "Get paid per view", d: "Approved earnings sit in a 72-hour hold, then land in your wallet. Withdraw from $15 in USDT (TRC20 only)." },
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

      {/* Trust & verification — true claims only. Nothing here
          promises views, earnings or safety as a guarantee. */}
      <section>
        <h2 className="mb-6 text-center font-display text-2xl font-black uppercase tracking-tight text-fg">
          Why creators and brands trust Get Paid To Post
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              t: "Funded upfront",
              d: "Every campaign is funded by the brand before it goes live. Creators are paid from that funded budget — never from promises.",
            },
            {
              t: "Verified views",
              d: "Views are checked through the platforms' own data where available (TikTok and YouTube) and reviewed by hand; Instagram views are checked by hand only — there is no automatic Instagram check yet. Only verified views from real people count.",
            },
            {
              t: "1% engagement gate",
              d: "Every clip needs at least 1% engagement — likes + comments only. Shares and saves never count.",
            },
            {
              t: "Bot-rejection ladder",
              d: "Bot-view rejections add up: 6 is a concern, 10 flags the account, and one more after the flag bans it automatically.",
            },
            {
              t: "Every rejection shows its reason",
              d: "A rejected clip always tells you why — bot views, brief mismatch, wrong content or duplicate. Appeal through Discord support if you think a rejection was wrong.",
            },
            {
              t: "Free to join — no fake engagement",
              d: "Creators never pay anything to join, post or earn. Fake engagement will lead to an account being strictly blocked or banned.",
            },
          ].map((c) => (
            <div
              key={c.t}
              className="rounded-2xl border border-fg/10 bg-card p-5"
            >
              <h3 className="font-display font-black tracking-tight text-fg">
                {c.t}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-fg/60">
                {c.d}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-sm">
          <Link
            href="/rules"
            className="font-bold text-limeink hover:underline"
          >
            Read the full rules →
          </Link>
        </p>
      </section>

      {/* FAQ */}
      <section>
        <Link href="/faq">
          <h2 className="mb-4 font-display text-2xl font-black uppercase tracking-tight text-fg hover:underline">
            Frequently asked questions
          </h2>
        </Link>
        <Faq items={FAQS} />
      </section>
    </div>
  );
}
