"use client";

import { useState } from "react";
import WithdrawModal from "./WithdrawModal";
import { WITHDRAW_MIN } from "@/lib/constants";

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
            ? `Minimum withdrawal is $${WITHDRAW_MIN}`
            : "Request a withdrawal"
        }
        className="rounded-full bg-lime px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
      >
        Request Withdrawal
      </button>
      {disabled && (
        <p className="mt-2 text-xs font-semibold text-fg/60">
          Minimum withdrawal is ${WITHDRAW_MIN}
        </p>
      )}
      {open && (
        <WithdrawModal available={available} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
