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
  // "Test notifications" state (Round-4 P2-A8): the result of
  // GET /api/admin/notify-health — a connectivity check that
  // sends nothing to Discord.
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  // The value that is actually saved on the server. The button is
  // "Saved ✓" and disabled while the input still equals it — it
  // only becomes "Save wallet address" again when the text changes
  // (friend's brand test, 2026-11-11: every tap re-saved and
  // looked like nothing stuck).
  const [savedWallet, setSavedWallet] = useState(currentWallet ?? "");
  const [busy, setBusy] = useState(false);
  const isSaved = savedWallet !== "" && wallet.trim() === savedWallet;

  async function save() {
    const address = wallet.trim();
    if (!isValidUsdtAddress(address)) {
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
      setSavedWallet(address);
      showSuccess("Admin wallet address saved.");
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not save the wallet.");
    } finally {
      setBusy(false);
    }
  }

  async function testNotifications() {
    setNotifyBusy(true);
    setNotifyResult(null);
    try {
      const res = await fetch("/api/admin/notify-health");
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string;
        detail?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Health check failed.");
      setNotifyResult(
        data.ok
          ? `✓ ${data.detail ?? "Notifications are working."}`
          : `⚠ ${data.detail ?? "Notifications are failing — check the Discord webhook URL."}`
      );
    } catch (err) {
      setNotifyResult(
        `⚠ Could not check notifications: ${err instanceof Error ? err.message : "request failed."}`
      );
    } finally {
      setNotifyBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-fg/10 bg-card p-5">
      <p className="text-sm leading-relaxed text-fg/60">
        Brands send their campaign budget in USDT (TRC20) to this wallet
        address. It is shown on the brand payment page after a campaign
        is submitted.
      </p>
      {savedWallet && (
        <p className="mt-3 rounded-xl bg-fg/5 px-4 py-3 text-xs leading-relaxed text-fg/60">
          Currently saved:{" "}
          <span className="break-all font-mono font-bold text-fg">
            {savedWallet}
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
          className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 font-mono text-sm text-fg outline-none placeholder:text-fg/30 focus:border-red-500"
        />
        <span className="mt-1 block text-xs font-medium text-fg/50">
          TRC20 addresses start with T and are 34 characters.
        </span>
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || isSaved}
        className="mt-4 flex items-center justify-center gap-2 rounded-full bg-red-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <>
            <Spinner /> Loading...
          </>
        ) : isSaved ? (
          "Saved ✓"
        ) : (
          "Save wallet address"
        )}
      </button>
      {/* Round-4 P2-A8: test the Discord webhook without sending
          anything — GET /api/admin/notify-health only asks
          Discord for the webhook object. A deleted/rotated
          webhook used to fail silently, so brand-payment alerts
          just stopped arriving. */}
      <div className="mt-4 border-t border-fg/10 pt-4">
        <p className="text-sm font-bold text-fg">Discord notifications</p>
        <p className="mt-1 text-xs leading-relaxed text-fg/50">
          Brand payment alerts go to Discord through the webhook
          URL set in Vercel. This check only asks Discord whether
          the webhook is still live — it sends no message.
        </p>
        <button
          type="button"
          onClick={() => void testNotifications()}
          disabled={notifyBusy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-fg/20 px-4 py-2 text-xs font-black text-fg transition hover:border-fg/40 disabled:opacity-40"
        >
          {notifyBusy ? (
            <>
              <Spinner /> Checking...
            </>
          ) : (
            "Test notifications"
          )}
        </button>
        {notifyResult && (
          <p className="mt-2 rounded-xl bg-fg/5 px-4 py-2.5 text-xs leading-relaxed text-fg/70">
            {notifyResult}
          </p>
        )}
      </div>
    </div>
  );
}
