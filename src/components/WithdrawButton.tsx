"use client";

import { useState } from "react";
import WithdrawModal from "./WithdrawModal";
import { WITHDRAW_MIN } from "@/lib/constants";
import { formatUSD } from "@/lib/money";

export default function WithdrawButton({ available }: { available: number }) {
  const [open, setOpen] = useState(false);
  const disabled = available < WITHDRAW_MIN;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={
          disabled
            ? `Minimum withdrawal is ${formatUSD(WITHDRAW_MIN)}`
            : "Request a withdrawal"
        }
        className="rounded-full bg-sun px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-sundark disabled:cursor-not-allowed disabled:opacity-40"
      >
        Request Withdrawal
      </button>
      {open && (
        <WithdrawModal available={available} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
