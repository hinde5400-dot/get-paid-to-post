import Link from "next/link";
import { BRAND_NAME } from "@/lib/constants";

/**
 * Pricing — the full fee picture, real numbers only.
 * Brand surface (Turn's fee-placement decision): the 15% platform
 * fee is disclosed here, on /brands, and in the brand form — never
 * on creator flow pages. Creators see only their own 5% withdrawal
 * fee, in the creators section below.
 */
export default function PricingPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div className="text-center">
        <h1 className="font-display text-4xl font-black uppercase tracking-tight text-fg">
          Pricing
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-fg/70 md:text-base">
          No subscription. No hidden charges. Brands pay a flat 15%
          platform fee on top of their campaign budget — creators join,
          post and earn for free.
        </p>
      </div>

      <section className="rounded-3xl border border-lime/40 bg-card p-6 md:p-8">
        <h2 className="text-xl font-extrabold text-fg">For brands</h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-fg/70">
          <li>
            • <strong className="text-fg">15% platform fee, on top of your budget.</strong>{" "}
            You send your campaign budget plus 15%. The campaign runs
            on the full budget — the fee never comes out of the
            creators&apos; pool.
          </li>
          <li>
            • <strong className="text-fg">No budget minimum.</strong>{" "}
            Any budget above $0. You set your own budget and your own
            single rate per 1,000 views for the whole campaign.
          </li>
          <li>
            • <strong className="text-fg">You pay only for verified views.</strong>{" "}
            Creators are paid per verified view at the rate you set, up
            to the maximum payout per post you choose ($10–$200, $100
            by default).
          </li>
          <li>
            • <strong className="text-fg">Unspent budget stays yours.</strong>{" "}
            Any budget left when your campaign ends is returned to you
            on request, within 5–7 business days.
          </li>
          <li>
            • <strong className="text-fg">No subscription, no setup fee.</strong>{" "}
            You only ever pay the budget you choose plus the 15% fee.
          </li>
        </ul>

        <div className="mt-6 rounded-2xl bg-fg/5 p-5">
          <p className="text-xs font-black uppercase tracking-widest text-fg/50">
            Example
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg/80">
            A <strong className="text-fg">$500 budget</strong> costs{" "}
            <strong className="text-fg">$575 in total</strong> — $500
            campaign budget + $75 platform fee (15%). The creators&apos;
            pool stays the full $500.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg/80">
            A <strong className="text-fg">$1,000 budget</strong> costs{" "}
            <strong className="text-fg">$1,150 in total</strong> — $1,000
            + $150 fee. The creators&apos; pool stays the full $1,000.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/brands"
            className="rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Launch a campaign →
          </Link>
          <Link
            href="/rules#brands"
            className="rounded-full border border-fg/20 px-6 py-3 text-sm font-bold text-fg transition hover:border-lime hover:text-lime"
          >
            Rules for brands
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-fg/10 bg-card p-6 md:p-8">
        <h2 className="text-xl font-extrabold text-fg">For creators</h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-fg/70">
          <li>
            • <strong className="text-fg">Free to join, post and earn.</strong>{" "}
            You never pay anything to join a campaign, post a clip, or
            earn per view.
          </li>
          <li>
            • <strong className="text-fg">Paid per verified view.</strong>{" "}
            Every approved clip earns the campaign&apos;s rate per 1,000
            verified views, up to the campaign&apos;s maximum payout per
            post. There is no base pay per post.
          </li>
          <li>
            • <strong className="text-fg">5% withdrawal fee.</strong>{" "}
            When you withdraw, you receive the amount × 0.95 in USDT
            (TRC20 or BEP20). Minimum withdrawal $15.
          </li>
          <li>
            • <strong className="text-fg">72-hour hold.</strong>{" "}
            Approved earnings sit in a 72-hour hold from approval, then
            become withdrawable.
          </li>
        </ul>
        <div className="mt-6">
          <Link
            href="/campaigns"
            className="rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Browse campaigns →
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">
          How brand funds are protected
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Your budget is funded before your campaign goes live. Creators
          are paid only for verified views at the rate you set — never
          for promises. {BRAND_NAME} never spends your budget on anything
          else, and never charges you for views that were not verified.
          Budgets are kept separate from operating money, and every
          payout is recorded and can be shown to you.
        </p>
      </section>
    </div>
  );
}
