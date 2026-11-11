import { BRAND_NAME } from "@/lib/constants";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Terms of Service</h1>
      <p className="text-sm text-fg/50">Last updated: 11 November 2026</p>

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
          You sign up with email and password.
          You are responsible for keeping your password safe and for
          everything posted from your account. One account per person.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Payouts are for creators aged 18 or older. By signing up you
          confirm you are 18 or older to receive payouts.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">4. Submissions and earnings</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• Clips must be vertical 9:16, with captions and a hook in the first 3 seconds.</li>
          <li>• Only TikTok, Instagram and YouTube links are accepted.</li>
          <li>• Submit your link within 30 minutes of posting the video — a link posted more than 30 minutes earlier is not accepted. Instagram links are hand-checked by the admin (no automatic check yet).</li>
          <li>• You are paid per verified view only — there is no base pay per post. Earnings are the smaller of (views / 1,000 × the campaign&apos;s rate per 1,000 views), the campaign maximum per post, and the remaining campaign budget. Views are tracked while your clip is pending, for up to 14 days after you submit. Once approved, earnings are fixed on the views at approval — later views don&apos;t add earnings. The campaign sets one rate per 1,000 views for the whole campaign — the same rate on TikTok, Instagram and YouTube.</li>
          <li>• A clip needs at least 1,000 views to earn — a clip below 1,000 views cannot be approved. A brand may set a higher minimum for its campaign.</li>
          <li>• Maximum payout per post: set by the brand between $10 and $200; $100 when the brand does not set one.</li>
          <li>• Every clip needs at least 1% engagement — (likes + comments) / views. Shares and saves never count. A clip below 1% cannot be approved.</li>
          <li>• Submissions stay Pending at $0 until approved.</li>
          <li>• Approved earnings move to your wallet after a 72-hour hold, starting at approval.</li>
          <li>• Up to 15 approved clips per platform per campaign (TikTok 15, Instagram 15, YouTube 15), and one clip per platform every 2 hours, across all campaigns on that platform. A rejected or duplicate submission does not start the cooldown. Rejected clips do not count toward the limit.</li>
          <li>• A rejected clip is done — there is no resubmit. Post a new clip instead. Every rejection shows its reason.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">5. Withdrawals</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• Minimum withdrawal is $15.</li>
          <li>• A 5% fee applies at withdrawal — the fee is rounded to the nearest cent, and you receive the amount after the fee, shown before you confirm.</li>
          <li>• Payout method: USDT (TRC20) only.</li>
          <li>• Payouts are processed by hand by the platform owner from the funded campaign budget. The site never sends money automatically.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">6. Brands and funding</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          A brand campaign only goes live after its budget is funded. The
          brand sets its own budget — any amount above $0 — and its own
          single rate per 1,000 views for the whole campaign. A 15%
          platform fee is charged on top of the budget: the brand sends
          budget + 15%, and the campaign runs on the full budget. Brands
          pay only for verified views. Unspent budget stays the
          brand&apos;s: ask for a refund through Discord support — the
          owner sends it manually in USDT. We aim to send it within 5–7
          business days of your request. A campaign that stays pending
          without payment expires after 7 days. The campaign, its proofs
          and its chat are deleted 1 day after the last hold matures —
          never earlier than 7 days after the campaign ended; money
          records (wallets, withdrawals) are never deleted.
        </p>
        <h3 className="mt-4 text-sm font-extrabold text-fg">
          How brand funds are protected
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Your budget is funded before your campaign goes live. Creators
          are paid only for verified views at the rate you set — never for
          promises. We never spend your budget on anything else, and we
          never charge you for views that were not verified. Your budget
          is tracked per campaign and only spent on approved views — ask
          the admin on Discord for a payout record for your campaign. Any
          budget left unspent when your campaign ends remains yours.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">7. Fair use and fake engagement</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Only real views from real people count. Fake engagement will lead
          to your account being strictly blocked or banned. Submitting someone
          else&apos;s content, or the same clip twice, will lead to the
          submission being rejected. Bot-view rejections add up: 6 is a
          concern, 10 flags the account, and one more bot-view rejection
          after the flag bans the account automatically. Every rejection
          shows its reason.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">8. Appeals and reversals</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          If you think a rejection or flag was wrong, appeal through
          Discord support. A person will review your appeal. We aim to
          reply within 10 business days.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          If a submission is rejected after it was approved, its
          earnings are reversed — taken back from your Pending Balance
          first, then from your Withdrawable Balance — and returned to
          the campaign budget. If the amount was already withdrawn, it
          cannot be clawed back.
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
