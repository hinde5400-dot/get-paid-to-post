"use client";

import { useState } from "react";
import type { Campaign } from "@/lib/types";
import type { CampaignStats } from "@/lib/data";
import CampaignCard from "./CampaignCard";
import CampaignModal from "./CampaignModal";

/**
 * Client wrapper for campaign grids (Home + Discover): renders the
 * cards and owns the TryShoot-style popup modal state. Clicking a card
 * opens the modal; the modal's buttons navigate to the detail page.
 */
export default function CampaignGrid({
  campaigns,
  stats,
}: {
  campaigns: Campaign[];
  stats: Record<string, CampaignStats | null>;
}) {
  const [selected, setSelected] = useState<Campaign | null>(null);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((c) => (
          <CampaignCard
            key={c.id}
            campaign={c}
            onOpen={() => setSelected(c)}
          />
        ))}
      </div>
      {selected && (
        <CampaignModal
          campaign={selected}
          stats={stats[selected.id] ?? null}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
