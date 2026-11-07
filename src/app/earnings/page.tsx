import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getWallet, getWithdrawals } from "@/lib/data";
import WithdrawButton from "@/components/WithdrawButton";
import { formatUSD } from "@/lib/money";
import { HOLD_HOURS, WITHDRAW_MIN } from "@/lib/constants";

export default async function EarningsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const wallet = await getWallet(user.id);
  const withdrawals = await getWithdrawals(user.id);

  const available = wallet?.available_balance ?? 0;
  const pending = wallet?.pending_balance ?? 0;
  const withdrawn = wallet?.withdrawn_total ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-white">Earnings</h1>
        <p className="mt-2 text-sm text-white/60">
          Approved earnings sit in a {HOLD_HOURS}-hour hold, then become
          available to withdraw.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-card p-5">
          <p className="text-xs text-white/50">Available to withdraw</p>
          <p className="mt-1 text-3xl font-black text-sun">
            {formatUSD(available)}
          </p>
          <div className="mt-4">
            <WithdrawButton available={available} />
          </div>
          {available < WITHDRAW_MIN && (
            <p className="mt-2 text-xs text-white/50">
              Minimum withdrawal is {formatUSD(WITHDRAW_MIN)}.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-5">
          <p className="text-xs text-white/50">Pending ({HOLD_HOURS}h hold)</p>
          <p className="mt-1 text-3xl font-black text-white">
            {formatUSD(pending)}
          </p>
          <p className="mt-4 text-xs text-white/50">
            Approved earnings become available after the {HOLD_HOURS}-hour hold.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-card p-5">
          <p className="text-xs text-white/50">Withdrawn</p>
          <p className="mt-1 text-3xl font-black text-white">
            {formatUSD(withdrawn)}
          </p>
          <p className="mt-4 text-xs text-white/50">
            Total paid out to you so far.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-white">Payout info</h2>
        <ul className="mt-3 space-y-2 text-sm text-white/70">
          <li>• Minimum withdrawal: {formatUSD(WITHDRAW_MIN)}.</li>
          <li>• Withdrawal fee: 7% — you receive amount × 0.93.</li>
          <li>• Methods: USDT (Ethereum), Pakistani bank (bank name + IBAN), Wise (USD / GBP / EUR).</li>
          <li>• Approved earnings are held for {HOLD_HOURS} hours before they become available.</li>
          <li>• Payouts are processed by the platform owner from the funded campaign budget.</li>
        </ul>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-extrabold text-white">
          Withdrawal history
        </h2>
        {withdrawals.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-card p-8 text-center">
            <p className="font-bold text-white">No withdrawals yet</p>
            <p className="mt-1 text-sm text-white/60">
              Your withdrawal requests will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
            {withdrawals.map((w) => (
              <div
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-5 py-3.5 text-sm last:border-0"
              >
                <span className="font-bold text-white">
                  {w.method === "usdt"
                    ? "USDT"
                    : w.method === "pakistani_bank"
                      ? "Pakistani Bank"
                      : "Wise"}{" "}
                  <span className="font-medium text-white/50">
                    · {new Date(w.created_at).toLocaleDateString("en-US")}
                  </span>
                </span>
                <span className="text-white/70">
                  {formatUSD(w.amount)} − {formatUSD(w.fee)} fee ={" "}
                  <span className="font-black text-sun">
                    {formatUSD(w.final_amount)}
                  </span>
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold capitalize text-white/70">
                  {w.status}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-sm">
          <Link href="/my-posts" className="font-bold text-sun hover:underline">
            View My Posts →
          </Link>
        </p>
      </div>
    </div>
  );
}
