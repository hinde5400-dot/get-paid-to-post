"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { feeFor, finalFor, formatUSD } from "@/lib/money";
import { WITHDRAW_MIN } from "@/lib/constants";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

const METHOD_HINT = "Your TRC20 USDT wallet address (starts with T).";

/** TRC20 USDT wallet address check — base58, starts with T,
 *  34 characters total. TRC20 is the only payout method. */
export function isValidUsdtAddress(address: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
}

const ADDRESS_ERROR =
  "Invalid USDT wallet address — TRC20 addresses start with T and are 34 characters.";

export default function WithdrawModal({
  available,
  onClose,
}: {
  available: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // The "Invalid address" hint shows only after a failed
  // validation — before that the field shows the neutral format
  // hint, not an error.
  const [addressInvalid, setAddressInvalid] = useState(false);

  const amountNum = useMemo(() => Number(amount) || 0, [amount]);
  // P2-C2: round the typed amount to cents FIRST — exactly like
  // the server (Math.round(amount * 100) / 100) — before computing
  // fee / final, so the preview matches the stored payout. A typed
  // $15.095 used to preview $14.35 while the server stored $15.10
  // and paid $14.34.
  const roundedAmount = useMemo(
    () => Math.round(amountNum * 100) / 100,
    [amountNum]
  );
  const fee = feeFor(roundedAmount);
  const final = finalFor(roundedAmount);
  const address = details.trim();

  function fillMax() {
    if (available > 0) setAmount(String(available));
  }

  async function submit() {
    if (amountNum < WITHDRAW_MIN) {
      showError(`Minimum withdrawal is $${WITHDRAW_MIN}`);
      return;
    }
    if (amountNum > available) {
      showError("Amount is more than your available balance.");
      return;
    }
    if (!isValidUsdtAddress(address)) {
      setAddressInvalid(true);
      showError("Invalid USDT wallet address");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // TRC20 is the only payout method (Turn's decision
        // 2026-11-11) — the server rejects anything else.
        body: JSON.stringify({ amount: roundedAmount, method: "usdt_trc20", details: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed.");
      showSuccess(
        "Withdrawal request sent. The owner processes payouts manually from the funded campaign budget."
      );
      setDone(true);
      router.refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Withdrawal failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-fg/10 bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-fg">Request Withdrawal</h2>
          <button
            onClick={onClose}
            className="rounded-full bg-fg/10 px-3 py-1 text-sm font-bold text-fg/70"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <p className="text-4xl">🎉</p>
            <p className="mt-3 text-lg font-bold text-fg">Withdrawal requested</p>
            <p className="mt-1 text-sm text-fg/60">
              Withdrawal request sent. The owner processes payouts
              manually from the funded campaign budget.
            </p>
            <p className="mt-2 text-sm text-fg/60">
              Requested{" "}
              <span className="font-bold text-lime">{formatUSD(final)}</span>{" "}
              in USDT (pending admin approval) — you&apos;ll receive it if
              approved.
            </p>
            <button
              onClick={onClose}
              className="mt-5 rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-ink"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-fg/60">
              Withdrawable balance:{" "}
              <span className="font-bold text-lime">{formatUSD(available)}</span>
            </p>
            <label className="mt-4 block text-sm font-bold text-fg">
              <span className="flex items-center justify-between gap-2">
                <span>Amount (USD)</span>
                <button
                  type="button"
                  onClick={fillMax}
                  disabled={available <= 0}
                  className="rounded-full bg-lime/15 px-2.5 py-0.5 text-xs font-black text-lime transition hover:bg-lime/25 disabled:opacity-40"
                >
                  Max {formatUSD(available)}
                </button>
              </span>
              <input
                type="number"
                min={WITHDRAW_MIN}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Min ${formatUSD(WITHDRAW_MIN)}`}
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none focus:border-lime"
              />
              <span className="mt-1 block text-xs font-medium text-fg/50">
                Max {formatUSD(available)} — you can only withdraw up to
                your withdrawable balance.
              </span>
            </label>
            <label className="mt-4 block text-sm font-bold text-fg">
              Enter your USDT (TRC20) wallet address
              <input
                type="text"
                value={details}
                onChange={(e) => {
                  setDetails(e.target.value);
                  setAddressInvalid(false);
                }}
                placeholder={METHOD_HINT}
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none focus:border-lime"
              />
              <span className="mt-1 block text-xs font-medium text-fg/50">
                {addressInvalid ? ADDRESS_ERROR : METHOD_HINT}
              </span>
            </label>
            {/* Prominent address warning (Turn's decision
                2026-11-11): the creator's own address is where the
                money goes — a wrong address loses it forever. */}
            <div className="mt-3 rounded-xl border-2 border-amber-500 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-black leading-relaxed text-amber-200">
                ⚠️ Enter your correct address — if you enter a wrong
                address, your money will be sent to the wrong place
                and cannot be recovered.
              </p>
            </div>

            {/* Fee preview — only for an amount that can actually be
                submitted ($15 minimum, within the balance). Showing
                a breakdown for $5 or above-balance amounts promised
                a payout that would be rejected. */}
            {amountNum >= WITHDRAW_MIN && amountNum <= available && (
              <div className="mt-4 rounded-xl bg-fg/5 p-4 text-sm text-fg/70">
                <div className="flex justify-between">
                  <span>Amount</span>
                  <span className="font-bold text-fg">{formatUSD(roundedAmount)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Fee (5%)</span>
                  <span className="font-bold text-fg">−{formatUSD(fee)}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-fg/10 pt-2 text-base">
                  <span className="font-bold text-fg">You receive</span>
                  <span className="font-black text-lime">{formatUSD(final)}</span>
                </div>
                <p className="mt-2 text-xs text-fg/50">
                  The 5% fee is rounded to the nearest cent — you receive
                  the amount shown above, in USDT.
                </p>
              </div>
            )}

            <button
              onClick={submit}
              disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <>
                  <Spinner /> Loading...
                </>
              ) : (
                "Confirm withdrawal"
              )}
            </button>
            <p className="mt-3 text-center text-sm font-semibold leading-relaxed text-fg/60">
              ⏱ Withdrawals are usually completed within 24 hours, and
              never take more than 3 days.
            </p>
            <p className="mt-2 text-center text-xs text-fg/40">
              Payouts are processed by the platform owner from the funded
              campaign budget.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
