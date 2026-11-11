/** Skeleton loading cards for campaign lists. */
export default function CampaignSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-fg/10 bg-card"
          aria-hidden
        >
          <div className="skeleton h-40 w-full" />
          <div className="space-y-3 p-5">
            <div className="skeleton h-4 w-2/3 rounded-full" />
            <div className="skeleton h-5 w-full rounded-full" />
            <div className="skeleton h-3 w-1/2 rounded-full" />
            <div className="skeleton h-2 w-full rounded-full" />
            <div className="flex justify-between">
              <div className="skeleton h-7 w-20 rounded-full" />
              <div className="skeleton h-7 w-16 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
