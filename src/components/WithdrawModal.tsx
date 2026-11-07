"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { feeFor, finalFor, formatUSD } from "@/lib/money";
import { WITHDRAW_MIN, WITHDRAW_METHODS, type WithdrawMethod } from "@/lib/constants";

const METHOD_HINTS: Record<WithdrawMethod, string> = {
  usdt_trc20: "Your TRC20 USDT wallet address (starts with T).",
  usdt_bep20: "Your BEP20 USDT wallet address (starts with 0x).",
};

/** Basic USDT wallet address check — TRC20 is base58 starting with T,
 *  BEP20 is an Ethereum-style 0x address. */
export function isValidUsdtAddress(method: WithdrawMethod, address: string) {
  if (method === "usdt_trc20") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

const ADDRESS_ERRORS: Record<WithdrawMethod, string> = {
  usdt_trc20: "Enter a valid TRC20 USDT wallet address (starts with T, 34 characters).",
  usdt_bep20: "Enter a valid BEP20 USDT wallet address (starts with 0x, 42 characters).",
};

export default function WithdrawModal({
  available,
  onClose,
}: {
  available: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<WithdrawMethod>("usdt_trc20");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const amountNum = useMemo(() => Number(amount) || 0, [amount]);
  const fee = feeFor(amountNum);
  const final = finalFor(amountNum);
  const address = details.trim();
  const valid =
    amountNum >= WITHDRAW_MIN &&
    amountNum <= available &&
    isValidUsdtAddress(method, address);

  async function submit() {
    setError("");
    if (amountNum < WITHDRAW_MIN) {
      setError(`Minimum withdrawal is ${formatUSD(WITHDRAW_MIN)}.`);
      return;
    }
    if (amountNum > available) {
      setError("Amount is more than your withdrawable balance.");
      return;
    }
    if (!isValidUsdtAddress(method, address)) {
      setError(ADDRESS_ERRORS[method]);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNum, method, details: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed.");
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdrawal failed.");
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
              Withdrawal request sent. Will be processed in 24-48 hours.
            </p>
            <p className="mt-2 text-sm text-fg/60">
              You will receive{" "}
              <span className="font-bold text-lime">{formatUSD(final)}</span>{" "}
              in USDT.
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
              Amount (USD)
              <input
                type="number"
                min={WITHDRAW_MIN}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Min ${formatUSD(WITHDRAW_MIN)}`}
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none focus:border-lime"
              />
            </label>
            <label className="mt-4 block text-sm font-bold text-fg">
              Payout method
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as WithdrawMethod)}
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none focus:border-lime"
              >
                {WITHDRAW_METHODS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm font-bold text-fg">
              USDT Wallet Address
              <input
                type="text"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={METHOD_HINTS[method]}
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-fg outline-none focus:border-lime"
              />
            </label>

            {amountNum > 0 && (
              <div className="mt-4 rounded-xl bg-fg/5 p-4 text-sm text-fg/70">
                <div className="flex justify-between">
                  <span>Amount</span>
                  <span className="font-bold text-fg">{formatUSD(amountNum)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Fee (7%)</span>
                  <span className="font-bold text-fg">−{formatUSD(fee)}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-fg/10 pt-2 text-base">
                  <span className="font-bold text-fg">You receive</span>
                  <span className="font-black text-lime">{formatUSD(final)}</span>
                </div>
                <p className="mt-2 text-xs text-fg/50">
                  You receive amount × 0.93 after the 7% fee, in USDT.
                </p>
              </div>
            )}

            {error && (
              <p className="mt-3 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">
                {error}
              </p>
            )}

            <button
              onClick={submit}
              disabled={busy || !valid}
              className="mt-5 w-full rounded-full bg-lime py-3 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Processing…" : "Confirm withdrawal"}
            </button>
            <p className="mt-3 text-center text-xs text-fg/40">
              Payouts are processed by the platform owner from the funded
              campaign budget. Double-check your wallet address — USDT sent
              to the wrong address cannot be recovered.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
