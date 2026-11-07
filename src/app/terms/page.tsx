import { BRAND_NAME } from "@/lib/constants";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Terms of Service</h1>
      <p className="text-sm text-fg/50">Last updated: 7 November 2026</p>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">1. What {BRAND_NAME} is</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          {BRAND_NAME} is a creator marketplace. Brands fund a campaign
          budget upfront. Creators post short vertical clips on TikTok,
          Instagram and YouTube, submit the links, and earn per view at the
          rate shown on the campaign.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">2. Definitions</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>
            • <strong className="text-fg">Campaign</strong> — a brand-funded
            promotion listed on the platform, with a set rate per 1,000
            views, a budget, and a brief creators must follow.
          </li>
          <li>
            • <strong className="text-fg">Creator</strong> — a person who
            signs up to post clips for live campaigns and earn per view.
          </li>
          <li>
            • <strong className="text-fg">Brand</strong> — a business or
            person who funds a campaign budget and sets the rate, budget,
            and brief.
          </li>
          <li>
            • <strong className="text-fg">Verified views</strong> — views
            on a submitted clip that the platform owner has checked and
            confirmed as real views from real people.
          </li>
          <li>
            • <strong className="text-fg">Pending Balance</strong> —
            approved earnings in the 72-hour hold. They are not yet
            withdrawable.
          </li>
          <li>
            • <strong className="text-fg">Withdrawable Balance</strong> —
            earnings that have passed the 72-hour hold and can be
            withdrawn, from a minimum of $15.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">3. Accounts</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          You sign up with email and password only. You are responsible for
          keeping your password safe and for everything posted from your
          account. One account per person.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">4. Submissions and earnings</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• Clips must be vertical 9:16, with captions and a hook in the first 3 seconds.</li>
          <li>• Only TikTok, Instagram and YouTube links are accepted.</li>
          <li>• Base pay is $10 per approved post, plus the campaign&apos;s rate per 1,000 views, tracked for 14 days.</li>
          <li>• Submissions stay Pending at $0 until approved.</li>
          <li>• Approved earnings move to your wallet after a 72-hour hold.</li>
          <li>• Up to 7 posts per campaign, and one clip per platform every 2 hours.</li>
          <li>• Earnings are calculated as views / 1,000,000 × the campaign rate per 1M views, capped at the campaign maximum per video and the remaining budget.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">5. Withdrawals</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• Minimum withdrawal is $15.</li>
          <li>• A 7% fee applies at withdrawal — you receive amount × 0.93.</li>
          <li>• Payout methods: USDT (TRC20) and USDT (BEP20) only.</li>
          <li>• Payouts are processed by the platform owner from the funded campaign budget.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">6. Brands and funding</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          A brand campaign only goes live after its budget is funded. The
          brand sets its own budget — any amount above $0. Brands pay
          only for verified views. Unspent budget stays the brand&apos;s.
        </p>
        <h3 className="mt-4 text-sm font-extrabold text-fg">
          How brand funds are protected
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Your budget is funded before your campaign goes live. Creators
          are paid only for verified views at the rate you set — never for
          promises. We never spend your budget on anything else, and we
          never charge you for views that were not verified. Budgets are
          kept separate from operating money, and every payout is
          recorded and can be shown to you. Any budget left unspent when
          your campaign ends remains yours.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">7. Fair use and fake engagement</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Only real views from real people count. Fake engagement will lead
          to your account being strictly blocked or banned. Submitting someone
          else&apos;s content, or the same clip twice, will lead to the
          submission being revoked.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">8. Appeals and reversals</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          If your submission is rejected or your account is flagged for
          fake engagement and you believe it is a mistake, you can appeal
          once through Discord support. A person will review your appeal
          and reply within 10 business days.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Approved earnings that have already settled to your
          Withdrawable Balance are never reversed. Only unsettled
          amounts — earnings still in your Pending Balance — can be
          returned to the campaign budget.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">9. No guarantee and content licence</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          We do not guarantee any number of views, earnings, or campaign
          availability. Earnings depend on the verified views your clips
          receive and on the campaign&apos;s remaining budget.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Once your published clip is approved, the brand may repost and
          use it to promote that campaign. If your clip is not approved,
          the brand receives no right to use it. You keep ownership of
          your original work.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">10. Changes</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          We may update these terms as the platform grows. The current terms
          on this page always apply.
        </p>
      </section>
    </div>
  );
}
