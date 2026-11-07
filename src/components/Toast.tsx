"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { playBuzz, playChime } from "@/lib/sounds";

/**
 * ONE shared feedback system for every form on the site.
 *
 * - Error: red popup, shake animation, low buzz sound.
 * - Success: green popup ("Success!" + message), happy chime.
 *
 * Every wrong action shows the red popup; every correct action shows
 * the green popup. No silent clicks anywhere: a button either
 * navigates, opens something, or fires one of these two popups.
 * Toasts auto-dismiss and can be tapped away. The provider lives in
 * the root layout, so toasts survive navigation.
 */

type ToastKind = "error" | "success";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-2), { id, kind, message }]);
    if (kind === "error") playBuzz();
    else playChime();
    // Auto-dismiss: errors stay a little longer so they can be read.
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, kind === "error" ? 5000 : 4000);
  }, []);

  const api: ToastApi = {
    showError: useCallback((message: string) => push("error", message), [push]),
    showSuccess: useCallback(
      (message: string) => push("success", message),
      [push]
    ),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Toasts sit above the bottom nav and above modals. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-8"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              setToasts((prev) => prev.filter((x) => x.id !== t.id))
            }
            className={`pointer-events-auto w-full max-w-md rounded-2xl px-4 py-3 text-left text-sm font-bold shadow-2xl ${
              t.kind === "error"
                ? "animate-shake border border-red-400/60 bg-red-600 text-white"
                : "border border-lime/60 bg-lime text-black"
            }`}
          >
            {t.kind === "success" ? (
              <>
                <span className="font-black">Success! </span>
                {t.message}
              </>
            ) : (
              t.message
            )}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
