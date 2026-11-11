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
  // Forms #26: getWithdrawals THROWS on DB error — a failed load
  // renders an honest error state, never an empty "no withdrawals"
  // view.
  let withdrawals: Awaited<ReturnType<typeof getWithdrawals>>;
  try {
    withdrawals = await getWithdrawals(user.id);
  } catch {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Earnings</h1>
        </div>
        <div className="rounded-3xl border border-red-500/40 bg-card p-8 text-center">
          <p className="text-lg font-black text-fg">
            Couldn&apos;t load your earnings
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            Your earnings could not be loaded — please try again. Your
            money is safe; this is a loading problem, not an empty
            balance.
          </p>
          <a
            href="/earnings"
            className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  const available = wallet?.available_balance ?? 0;
  const pending = wallet?.pending_balance ?? 0;
  // Round-3 P2-19: wallet.withdrawn_total is incremented at
  // REQUEST time, so it counts money merely requested — a pending
  // request already inflated "Total withdrawn so far". The honest
  // total is the withdrawals the owner actually marked paid.
  const withdrawn = withdrawals
    .filter((w) => w.status === "paid")
    .reduce((sum, w) => sum + Number(w.amount ?? 0), 0);
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
          Approved earnings go into a 72-hour hold as soon as they are approved, then become Withdrawable. You can withdraw anytime when Withdrawable is $15 or more.
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
        Total withdrawn so far (paid withdrawals only — pending
        requests not included):{" "}
        <span className="font-bold text-fg">{formatUSD(withdrawn)}</span>
      </p>

      <div className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">Payout info</h2>
        <ul className="mt-3 space-y-2 text-sm text-fg/70">
          <li>• Minimum withdrawal: {formatUSD(WITHDRAW_MIN)}.</li>
          <li>• Withdrawal fee: 5% — the fee is rounded to the nearest cent, and you receive the amount after the fee.</li>
          <li>• Method: USDT (TRC20) only.</li>
          <li>• Payout time: usually completed within 24 hours, and never more than 3 days.</li>
          <li>• Approved earnings are held for {HOLD_HOURS} hours before they become available.</li>
          <li>• Payouts are processed manually by the platform owner from the funded campaign budget.</li>
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
                      {w.status !== "rejected" && (
                        <span className="text-xs text-fg/50">
                          → {formatUSD(w.final_amount)} after fee
                        </span>
                      )}
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
