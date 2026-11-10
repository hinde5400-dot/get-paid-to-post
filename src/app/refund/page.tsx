export default function RefundPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Refund Policy</h1>
      <p className="text-sm text-fg/50">Last updated: 10 November 2026</p>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">1. Brand budgets</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Your campaign budget is funded before your campaign goes live.
          Creators are paid only for verified views at the rate you set.
          Any budget left unspent when your campaign ends stays yours —
          it is returned to you on request, within 5–7 business days of
          the request.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          There is no refund on budget already spent on verified views:
          once a creator&apos;s views have been verified and approved,
          that part of your budget has been earned and cannot be taken
          back.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          If your campaign is rejected before it goes live, none of your
          budget has been spent, and your full budget is returned to you
          on request, within 5–7 business days of the request.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">2. Creator withdrawals</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Withdrawals that have already been settled — paid to your USDT
          wallet — are never reversed. Earnings can be reversed from
          your Pending Balance first, then from your Withdrawable
          Balance, and returned to the campaign budget — only amounts
          already withdrawn (paid out) cannot be taken back.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">3. How to request a refund</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Ask for a refund through Discord support — open a support
          ticket in the Discord server and the platform owner will
          review it. Refunds are sent back in USDT to the wallet address
          you paid from, or to the address you give in your ticket.
        </p>
      </section>
    </div>
  );
}
