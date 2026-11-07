import CampaignSkeleton from "@/components/CampaignSkeleton";

export default function CampaignsLoading() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-10 w-48 rounded-full" />
      <div className="skeleton h-4 w-full max-w-md rounded-full" />
      <CampaignSkeleton count={6} />
    </div>
  );
}
