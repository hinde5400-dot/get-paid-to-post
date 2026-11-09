import type { Campaign } from "@/lib/types";

/**
 * Bold typographic banner graphic for a campaign — no fake brand logos,
 * no stock photos, no invented imagery. A dark gradient picked from the
 * brand name, the brand's initials in huge display type, a subtle dot
 * pattern, and a LIVE / SETTLING pill. The same banner is used on cards, the
 * featured section and the campaign detail page.
 */

// Dark gradients (near-black base with a tint) so white text always reads.
const GRADIENTS: Array<[string, string]> = [
  ["#3A2E00", "#141417"], // amber / yellow tint
  ["#0E2A24", "#141417"], // deep teal
  ["#22153A", "#141417"], // deep violet
  ["#33101F", "#141417"], // deep rose
  ["#0E2233", "#141417"], // deep blue
  ["#1C2E10", "#141417"], // deep green
];

function hashBrand(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

export function brandInitials(brandName: string): string {
  const words = brandName.split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "G";
  const second = words[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

/**
 * Brand logo tile: the brand's logo image when a logo_url exists
 * (from the brand form, migration 0004), otherwise the brand
 * initials on a lime tile.
 */
export function BrandLogoTile({
  campaign,
  size = "md",
}: {
  campaign: Campaign;
  size?: "sm" | "md" | "lg";
}) {
  const cls =
    size === "lg"
      ? "h-14 w-14 rounded-2xl text-2xl"
      : size === "sm"
        ? "h-9 w-9 rounded-xl text-sm"
        : "h-11 w-11 rounded-2xl text-lg";
  if (campaign.logo_url) {
    return (
      <img
        src={campaign.logo_url}
        alt={`${campaign.brand_name} logo`}
        className={`${cls} relative shrink-0 object-cover`}
      />
    );
  }
  return (
    <span
      className={`relative flex ${cls} shrink-0 items-center justify-center bg-lime font-display font-black text-black`}
    >
      {brandInitials(campaign.brand_name)}
    </span>
  );
}

export default function CampaignBanner({
  campaign,
  size = "md",
  showLive = true,
  badge,
  isLive = true,
}: {
  campaign: Campaign;
  size?: "sm" | "md" | "lg";
  showLive?: boolean;
  /** Cap badge overlaid on the banner, e.g. "Up to $75 per post". */
  badge?: string;
  /** Live pill vs amber Settling pill (P1-a) — pass false for an
   *  ended campaign still in its settlement window. Defaults to
   *  true so existing live-only callers are unchanged. */
  isLive?: boolean;
}) {
  const [from, to] = GRADIENTS[hashBrand(campaign.brand_name) % GRADIENTS.length];
  const height =
    size === "lg" ? "h-56 md:h-72" : size === "sm" ? "h-32" : "h-40";
  const bigText = size === "lg" ? "text-7xl md:text-8xl" : "text-5xl";
  // When the brand pasted a thumbnail image link (migration 0009),
  // it becomes the banner photo; otherwise the typographic gradient
  // banner is used. No stock photos, no invented imagery.
  const thumbnail = campaign.thumbnail_url?.trim() || null;
  return (
    <div
      className={`relative flex items-end justify-between overflow-hidden ${height} p-5`}
      style={
        thumbnail
          ? undefined
          : { background: `linear-gradient(120deg, ${from} 0%, ${to} 70%)` }
      }
    >
      {thumbnail ? (
        <>
          <img
            src={thumbnail}
            alt={`${campaign.brand_name} campaign thumbnail`}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
        </>
      ) : (
        <>
          {/* subtle dot pattern */}
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
          />
          {/* giant initials watermark */}
          <span
            className={`pointer-events-none absolute -right-2 -top-4 font-display font-black uppercase leading-none text-white/[0.07] ${bigText}`}
            aria-hidden
          >
            {brandInitials(campaign.brand_name)}
          </span>
        </>
      )}
      <div className="relative">
        {showLive && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${
              isLive ? "bg-lime text-black" : "bg-amber-400 text-black"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-black" />
            {isLive ? "Live" : "Settling"}
          </span>
        )}
        <p className="mt-2 font-display text-xl font-black uppercase leading-none tracking-tight text-white md:text-2xl">
          {campaign.brand_name}
        </p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-white/60">
          {campaign.category}
        </p>
      </div>
      {badge && (
        <span className="absolute right-3 top-3 rounded-full bg-lime px-3 py-1.5 text-xs font-black text-black shadow-lg">
          {badge}
        </span>
      )}
      <BrandLogoTile campaign={campaign} />
    </div>
  );
}
