import { redirect } from "next/navigation";

/**
 * /discover is the alias the owner types and the auth pages redirect
 * to — it simply forwards to the canonical /campaigns route,
 * preserving any ?message= param (e.g. "already-logged-in").
 */
export default function DiscoverPage({
  searchParams,
}: {
  searchParams: { message?: string };
}) {
  const qs = new URLSearchParams();
  if (searchParams.message) qs.set("message", searchParams.message);
  const suffix = qs.toString();
  redirect(`/campaigns${suffix ? `?${suffix}` : ""}`);
}
