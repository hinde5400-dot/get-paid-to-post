"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { feeFor, finalFor, formatUSD } from "@/lib/money";
import { WITHDRAW_MIN } from "@/lib/constants";

type Method = "usdt" | "pakistani_bank" | "wise";

const METHODS: { key: Method; label: string; hint: string }[] = [
  { key: "usdt", label: "USDT (Ethereum)", hint: "Your USDT wallet address (ERC-20)." },
  { key: "pakistani_bank", label: "Pakistani Bank", hint: "Bank name + IBAN." },
  { key: "wise", label: "Wise", hint: "Wise account email + currency (USD / GBP / EUR)." },
];

export default function WithdrawModal({
  available,
  onClose,
}: {
  available: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("usdt");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const amountNum = useMemo(() => Number(amount) || 0, [amount]);
  const fee = feeFor(amountNum);
  const final = finalFor(amountNum);
  const valid =
    amountNum >= WITHDRAW_MIN && amountNum <= available && details.trim().length > 0;

  async function submit() {
    setError("");
    if (!valid) {
      setError(
        amountNum < WITHDRAW_MIN
          ? `Minimum withdrawal is ${formatUSD(WITHDRAW_MIN)}.`
          : "Please check the amount and payout details."
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNum, method, details: details.trim() }),
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
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-white">Request Withdrawal</h2>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white/70"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <p className="text-4xl">🎉</p>
            <p className="mt-3 text-lg font-bold text-white">Withdrawal requested</p>
            <p className="mt-1 text-sm text-white/60">
              Your payout of {formatUSD(final)} is being processed. It will be
              sent to the details you provided.
            </p>
            <button
              onClick={onClose}
              className="mt-5 rounded-full bg-sun px-5 py-2.5 text-sm font-bold text-ink"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-white/60">
              Available balance:{" "}
              <span className="font-bold text-sun">{formatUSD(available)}</span>
            </p>
            <label className="mt-4 block text-sm font-bold text-white">
              Amount (USD)
              <input
                type="number"
                min={WITHDRAW_MIN}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Min ${formatUSD(WITHDRAW_MIN)}`}
                className="mt-1 w-full rounded-xl border border-white/15 bg-ink px-4 py-3 text-white outline-none focus:border-sun"
              />
            </label>
            <label className="mt-4 block text-sm font-bold text-white">
              Payout method
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-ink px-4 py-3 text-white outline-none focus:border-sun"
              >
                {METHODS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm font-bold text-white">
              Payout details
              <input
                type="text"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={
                  METHODS.find((m) => m.key === method)?.hint ?? ""
                }
                className="mt-1 w-full rounded-xl border border-white/15 bg-ink px-4 py-3 text-white outline-none focus:border-sun"
              />
            </label>

            {amountNum > 0 && (
              <div className="mt-4 rounded-xl bg-white/5 p-4 text-sm text-white/70">
                <div className="flex justify-between">
                  <span>Amount</span>
                  <span className="font-bold text-white">{formatUSD(amountNum)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Fee (7%)</span>
                  <span className="font-bold text-white">−{formatUSD(fee)}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-base">
                  <span className="font-bold text-white">You receive</span>
                  <span className="font-black text-sun">{formatUSD(final)}</span>
                </div>
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
              className="mt-5 w-full rounded-full bg-sun py-3 text-sm font-bold text-ink transition hover:bg-sundark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Processing…" : "Confirm withdrawal"}
            </button>
            <p className="mt-3 text-center text-xs text-white/40">
              Payouts are processed by the platform owner from the funded
              campaign budget.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
