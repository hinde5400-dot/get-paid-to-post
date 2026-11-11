import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Discover",
  description:
    "Discover live brand-funded campaigns on Get Paid To Post. Pick one, post a clip on TikTok, Instagram or YouTube, and get paid per verified view.",
};

/**
 * /discover is the alias the owner types and the auth pages redirect
 * to — it simply forwards to the canonical /campaigns route,
 * preserving every query param (filters, tab, message, ...).
 */
export default function DiscoverPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    }
  }
  const suffix = qs.toString();
  redirect(`/campaigns${suffix ? `?${suffix}` : ""}`);
}
