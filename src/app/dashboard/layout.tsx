import type { Metadata } from "next";

/**
 * Metadata lives here, not in page.tsx: the page is a client
 * component ("use client") and Next forbids metadata exports from
 * client components.
 */
export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Your Get Paid To Post dashboard — track your earnings, submissions and withdrawals.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
