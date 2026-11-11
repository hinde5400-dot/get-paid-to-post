import type { Metadata } from "next";

/**
 * Metadata lives here, not in page.tsx: the page is a client
 * component ("use client") and Next forbids metadata exports from
 * client components. Same pattern for reset-password and connect.
 */
export const metadata: Metadata = {
  title: "Forgot password",
  description:
    "Reset your Get Paid To Post password — enter your email and we will send you a reset link.",
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
