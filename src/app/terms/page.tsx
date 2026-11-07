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
        <h2 className="text-lg font-extrabold text-fg">2. Accounts</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          You sign up with email and password only. You are responsible for
          keeping your password safe and for everything posted from your
          account. One account per person.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">3. Submissions and earnings</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• Clips must be vertical 9:16, with captions and a hook in the first 3 seconds.</li>
          <li>• Only TikTok, Instagram and YouTube links are accepted.</li>
          <li>• Base pay is $10 per approved post, plus $0.75 per 1,000 views, tracked for 14 days.</li>
          <li>• Submissions stay Pending at $0 until approved.</li>
          <li>• Approved earnings move to your wallet after a 72-hour hold.</li>
          <li>• Up to 7 posts per campaign, and one clip per platform every 2 hours.</li>
          <li>• Earnings are calculated as views / 1,000,000 × the campaign rate per 1M views, capped at the campaign maximum per video and the remaining budget.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">4. Withdrawals</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• Minimum withdrawal is $10.</li>
          <li>• A 7% fee applies at withdrawal — you receive amount × 0.93.</li>
          <li>• Payout methods: USDT (TRC20) and USDT (BEP20) only.</li>
          <li>• Payouts are processed by the platform owner from the funded campaign budget.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">5. Brands and funding</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          A brand campaign only goes live after its budget is funded. The
          brand sets its own budget — any amount above $0. Brands pay
          only for verified views. Unspent budget stays the brand&apos;s.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">6. Fair use and fake engagement</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Only real views from real people count. Fake engagement will lead
          to your account being strictly blocked or banned. Submitting someone
          else&apos;s content, or the same clip twice, will lead to the
          submission being revoked.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">7. Changes</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          We may update these terms as the platform grows. The current terms
          on this page always apply.
        </p>
      </section>
    </div>
  );
}
