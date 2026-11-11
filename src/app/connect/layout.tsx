import type { Metadata } from "next";

/**
 * Metadata lives here, not in page.tsx: the page is a client
 * component ("use client") and Next forbids metadata exports from
 * client components.
 */
export const metadata: Metadata = {
  title: "Connect accounts",
  description:
    "Connect your TikTok, Instagram and YouTube accounts to Get Paid To Post so you can submit clips and we can verify your views.",
};

export default function ConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
