"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";
import { isValidUsdtAddress } from "./WithdrawModal";

/**
 * Owner-only Admin Settings form: save the USDT (TRC20) wallet
 * address brands send their campaign budget to. The address is
 * shown on the brand payment page. TRC20 validation reuses the
 * withdrawal check (T + 33 base58 characters).
 */
export default function AdminSettingsForm({
  currentWallet,
}: {
  currentWallet: string | null;
}) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const [wallet, setWallet] = useState(currentWallet ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const address = wallet.trim();
    if (!isValidUsdtAddress("usdt_trc20", address)) {
      showError(
        "Invalid USDT wallet address — TRC20 addresses start with T and are 34 characters."
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the wallet.");
      showSuccess("Admin wallet address saved.");
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not save the wallet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-fg/10 bg-card p-5">
      <p className="text-sm leading-relaxed text-fg/60">
        Brands send their campaign budget in USDT (TRC20) to this wallet
        address. It is shown on the brand payment page after a campaign
        is submitted.
      </p>
      {currentWallet && (
        <p className="mt-3 rounded-xl bg-fg/5 px-4 py-3 text-xs leading-relaxed text-fg/60">
          Currently saved:{" "}
          <span className="break-all font-mono font-bold text-fg">
            {currentWallet}
          </span>
        </p>
      )}
      <label className="mt-4 block text-sm font-bold text-fg">
        Admin USDT (TRC20) Wallet Address
        <input
          type="text"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="T..."
          autoComplete="off"
          spellCheck={false}
          className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 font-mono text-sm text-fg outline-none placeholder:text-fg/30 focus:border-lime"
        />
        <span className="mt-1 block text-xs font-medium text-fg/50">
          TRC20 addresses start with T and are 34 characters.
        </span>
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="mt-4 flex items-center justify-center gap-2 rounded-full bg-lime px-6 py-2.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <Spinner /> Loading...
          </>
        ) : (
          "Save wallet address"
        )}
      </button>
    </div>
  );
}
