import CampaignSkeleton from "@/components/CampaignSkeleton";

/**
 * Discover loading state (2026-11-16, P0-1): the skeleton alone
 * reads as a blank page on the light theme, so the wait now says
 * so in words — a brand-mode user sees this for a moment before
 * the redirect to My Campaigns fires.
 */
export default function CampaignsLoading() {
  return (
    <div className="space-y-6">
      <p className="flex items-center gap-2 text-sm font-bold text-fg/60">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-fg/20 border-t-lime" aria-hidden />
        Loading campaigns…
      </p>
      <div className="skeleton h-10 w-48 rounded-full" />
      <div className="skeleton h-4 w-full max-w-md rounded-full" />
      <CampaignSkeleton count={6} />
    </div>
  );
}
