import { permanentRedirect } from "next/navigation";

/**
 * /discover is the alias the owner types and the auth pages redirect
 * to — it simply forwards to the canonical /campaigns route,
 * preserving every query param (filters, tab, message, ...).
 * The alias is permanent, so the redirect is a 308.
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
  permanentRedirect(`/campaigns${suffix ? `?${suffix}` : ""}`);
}
