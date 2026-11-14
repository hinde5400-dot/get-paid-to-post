import type { Metadata } from "next";
import Link from "next/link";
import Faq from "@/components/Faq";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about Get Paid To Post — how you get paid, video rules, fake engagement, budgets and what happens after a campaign ends.",
  openGraph: {
    title: "FAQ | Get Paid To Post",
    description:
      "Frequently asked questions about Get Paid To Post — how you get paid, video rules, fake engagement, budgets and what happens after a campaign ends.",
  },
};

// Same questions and answers as the FAQ section on the home page —
// no new claims, no new numbers.
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

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div className="text-center">
        <h1 className="font-display text-4xl font-black uppercase tracking-tight text-fg">
          Frequently asked questions
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-fg/70 md:text-base">
          How you get paid, the video rules, fake engagement, budgets and
          what happens after a campaign ends.
        </p>
      </div>
      <Faq items={FAQS} />
      <p className="text-center text-sm">
        <Link
          href="/support"
          className="font-bold text-limeink hover:underline"
        >
          Still stuck? Get support →
        </Link>
      </p>
    </div>
  );
}
