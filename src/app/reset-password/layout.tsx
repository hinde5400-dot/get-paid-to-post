import type { Metadata } from "next";

/**
 * Metadata lives here, not in page.tsx: the page is a client
 * component ("use client") and Next forbids metadata exports from
 * client components.
 */
export const metadata: Metadata = {
  title: "Reset password",
  description:
    "Choose a new password for your Get Paid To Post account.",
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
