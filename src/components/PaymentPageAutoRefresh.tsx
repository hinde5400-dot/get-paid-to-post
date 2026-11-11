"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Auto-refresh for the (pending) brand payment page (Round-4
 * P2-B7): revalidates the server state every 30s and on window
 * focus, so an approval or an admin reply shows without a manual
 * reload. Rendered only while the campaign is pending — once it
 * goes live the page unmounts this component with the pending
 * branch. Client component state (e.g. the TxID input) is kept
 * across router.refresh().
 */
export default function PaymentPageAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 30_000);
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  return null;
}
