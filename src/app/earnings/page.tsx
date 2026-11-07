import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getWallet, getWithdrawals } from "@/lib/data";
import WithdrawButton from "@/components/WithdrawButton";
import { formatUSD } from "@/lib/money";
import { HOLD_HOURS, WITHDRAW_MIN, WITHDRAW_METHOD_LABELS } from "@/lib/constants";

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  approved: "bg-sky-500/15 text-sky-300",
  paid: "bg-lime/15 text-lime",
  rejected: "bg-red-500/15 text-red-300",
};

export default async function EarningsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const wallet = await getWallet(user.id);
  const withdrawals = await getWithdrawals(user.id);

  const available = wallet?.available_balance ?? 0;
  const pending = wallet?.pending_balance ?? 0;
  const withdrawn = wallet?.withdrawn_total ?? 0;
  const total = available + pending;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Earnings</h1>
        <p className="mt-2 text-sm text-fg/60">
          Approved earnings sit in a {HOLD_HOURS}-hour hold, then become
          available to withdraw. Payouts are USDT only.
        </p>
        <p className="mt-2 max-w-2xl rounded-xl bg-lime/10 px-4 py-3 text-sm font-semibold leading-relaxed text-lime">
          After campaign ends and views are verified, your earnings go to Pending for 72-hour hold, then become Withdrawable. You can withdraw anytime when Withdrawable is more than $15.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-fg/10 bg-card p-5">
          <p className="text-xs text-fg/50">Total Balance</p>
          <p className="mt-1 text-3xl font-black text-fg">
            {formatUSD(total)}
          </p>
          <p className="mt-4 text-xs text-fg/50">Withdrawable + Pending.</p>
        </div>
        <div className="rounded-2xl border border-fg/10 bg-card p-5">
          <p className="text-xs text-fg/50">Pending Balance</p>
          <p className="mt-1 text-3xl font-black text-fg">
            {formatUSD(pending)}
          </p>
          <p className="mt-4 text-xs text-fg/50">
            Approved earnings become available after 72-hour hold.
          </p>
        </div>
        <div className="rounded-2xl border border-fg/10 bg-card p-5">
          <p className="text-xs text-fg/50">Withdrawable Balance</p>
          <p className="mt-1 text-3xl font-black text-lime">
            {formatUSD(available)}
          </p>
          <div className="mt-4">
            <WithdrawButton available={available} />
          </div>
          <p className="mt-2 text-xs text-fg/50">
            Ready to withdraw. Minimum $15.00.
          </p>
        </div>
      </div>

      <p className="text-sm text-fg/50">
        Total withdrawn so far:{" "}
        <span className="font-bold text-fg">{formatUSD(withdrawn)}</span>
      </p>

      <div className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">Payout info</h2>
        <ul className="mt-3 space-y-2 text-sm text-fg/70">
          <li>• Minimum withdrawal: {formatUSD(WITHDRAW_MIN)}.</li>
          <li>• Withdrawal fee: 7% — you receive amount × 0.93 in USDT.</li>
          <li>• Methods: USDT (TRC20) and USDT (BEP20) only.</li>
          <li>• Approved earnings are held for {HOLD_HOURS} hours before they become available.</li>
          <li>• Payouts are processed by the platform owner from the funded campaign budget, within 24-48 hours.</li>
        </ul>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-extrabold text-fg">
          Withdraw History
        </h2>
        {withdrawals.length === 0 ? (
          <div className="rounded-2xl border border-fg/10 bg-card p-8 text-center">
            <p className="font-bold text-fg">No withdrawals yet</p>
            <p className="mt-1 text-sm text-fg/60">
              Your withdrawal requests will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-fg/10 bg-card">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead>
                <tr className="border-b border-fg/10 text-xs uppercase tracking-wide text-fg/50">
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 font-bold">Amount</th>
                  <th className="px-5 py-3 font-bold">Method</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-fg/5 last:border-0">
                    <td className="px-5 py-3.5 text-fg/80">
                      {new Date(w.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-bold text-fg">{formatUSD(w.amount)}</span>{" "}
                      <span className="text-xs text-fg/50">
                        → {formatUSD(w.final_amount)} after fee
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-fg/80">
                      {WITHDRAW_METHOD_LABELS[w.method] ?? w.method}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${STATUS_CLS[w.status] ?? STATUS_CLS.pending}`}
                      >
                        {w.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-sm">
          <Link href="/my-posts" className="font-bold text-lime hover:underline">
            View My Posts →
          </Link>
        </p>
      </div>
    </div>
  );
}
