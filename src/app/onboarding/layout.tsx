import type { Metadata } from "next";

/**
 * Metadata lives here, not in page.tsx: the page is a client
 * component ("use client") and Next forbids metadata exports from
 * client components.
 */
export const metadata: Metadata = {
  title: "Onboarding",
  description:
    "Set up your Get Paid To Post account — connect your TikTok, Instagram and YouTube profiles so you can submit clips.",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
