import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getModeContext } from "@/lib/mode";
import {
  getBrandCampaigns,
  getCampaignBudgetHistory,
  paidBudgetCoveredByPayment,
  type BudgetHistoryEntry,
} from "@/lib/data";
import { formatUSD, totalToSend } from "@/lib/money";
import { truncateTxId } from "@/lib/validate";
import type { Campaign } from "@/lib/types";

export const metadata: Metadata = {
  title: "Payments",
  description:
    "Payments you made for your campaigns — amount, campaign and verification status.",
};

/**
 * Brand payments: every campaign with a payment (TxID) on file.
 * The amount is what the TxID covered — budget + 15% platform
 * fee, computed from the budget history the same way the payment
 * page does (a budget edited after payment does not rewrite what
 * was actually sent). "Verified" only when the admin approved the
 * campaign (is_funded); otherwise the payment is honestly
 * "Pending verification". There is no verified-at column, so no
 * verified date is shown — only the date the payment was
 * submitted.
 */
export default async function BrandPaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { brandCapable } = await getModeContext();
  if (!brandCapable) redirect("/campaigns");

  let campaigns: Campaign[] = [];
  let loadError = false;
  try {
    campaigns = await getBrandCampaigns(user.id);
  } catch {
    loadError = true;
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-red-500/40 bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-fg">
          Couldn&apos;t load your payments
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg/60">
          Your payments could not be loaded — please try again. Your
          data is safe; this is a loading problem, not an empty list.
        </p>
        <Link
          href="/brand/payments"
          className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
        >
          Try again
        </Link>
      </div>
    );
  }

  const paid = campaigns.filter((c) => Boolean(c.payment_tx_id?.trim()));
  // Amount actually sent per campaign (budget history, best
  // effort — falls back to the current budget when the history
  // cannot be read).
  let historyById: Record<string, BudgetHistoryEntry[]> = {};
  try {
    historyById = await getCampaignBudgetHistory(paid.map((c) => c.id));
  } catch {
    historyById = {};
  }
  const amounts = new Map<string, number>();
  for (const c of paid) {
    const paidBudget = paidBudgetCoveredByPayment(
      historyById[c.id] ?? [],
      (c as unknown as { payment_tx_submitted_at?: string | null })
        .payment_tx_submitted_at ?? null,
      c.created_at ?? null
    );
    amounts.set(
      c.id,
      totalToSend(paidBudget ?? Number(c.budget_total ?? 0))
    );
  }
  const totalPaid = [...amounts.values()].reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">
          Payments
        </h1>
        <p className="mt-1 text-sm text-fg/60">
          What you paid, for which campaign, and whether the admin
          verified it.
        </p>
      </div>

      {paid.length > 0 && (
        <div className="overflow-hidden rounded-3xl bg-lime p-6 text-black">
          <p className="text-xs font-black uppercase tracking-widest text-black/60">
            Total paid
          </p>
          <p className="mt-1 font-display text-4xl font-black tracking-tight">
            {formatUSD(totalPaid)}
          </p>
          <p className="mt-1 text-sm font-semibold text-black/70">
            {paid.length} payment{paid.length === 1 ? "" : "s"} · budget +
            15% platform fee, USDT (TRC20)
          </p>
        </div>
      )}

      {paid.length === 0 ? (
        <div className="rounded-2xl border border-fg/10 bg-card p-8 text-center">
          <p className="text-4xl" aria-hidden>
            $
          </p>
          <h3 className="mt-3 text-lg font-black text-fg">No payments yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            You haven&apos;t paid for any campaign yet. Launch a campaign
            and fund it in USDT — your payment shows up here.
          </p>
          <Link
            href="/brands"
            className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Launch a campaign
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {paid.map((c) => {
            const verified = Boolean(c.is_funded);
            const submittedAt = (
              c as unknown as { payment_tx_submitted_at?: string | null }
            ).payment_tx_submitted_at;
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-fg/10 bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-lg font-black text-fg">
                      {c.title}
                    </h3>
                    <p className="mt-1 text-sm text-fg/60">
                      Budget {formatUSD(c.budget_total)} ·{" "}
                      {submittedAt
                        ? `Submitted ${new Date(submittedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}`
                        : "Submitted date unknown"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl font-black text-fg">
                      {formatUSD(amounts.get(c.id) ?? 0)}
                    </p>
                    <span
                      className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-black ${
                        verified
                          ? "bg-lime/15 text-lime"
                          : "bg-yellow-500/15 text-yellow-300"
                      }`}
                    >
                      {verified ? "Verified" : "Pending verification"}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                  <a
                    href={`https://tronscan.org/#/transaction/${c.payment_tx_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-lime hover:underline"
                  >
                    TxID: {truncateTxId(c.payment_tx_id ?? "")} ↗
                  </a>
                  <Link
                    href={`/brands/payment/${c.id}`}
                    className="font-bold text-fg/70 hover:text-lime"
                  >
                    View payment →
                  </Link>
                </div>
                {!verified && (
                  <p className="mt-3 text-xs leading-relaxed text-fg/50">
                    The admin is verifying your payment. Your campaign
                    goes live once it is verified.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
