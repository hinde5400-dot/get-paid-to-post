/**
 * Labelled ad placeholder. No fake ads, no publisher ID.
 * This slot earns $0 until a real ad account is approved and connected.
 */
export default function AdSlot({ label = "Advertisement" }: { label?: string }) {
  return (
    <div className="flex min-h-[90px] flex-col items-center justify-center rounded-2xl border border-dashed border-fg/20 bg-fg/[0.03] px-4 py-6 text-center">
      <p className="text-[11px] font-bold uppercase tracking-widest text-fg/40">
        {label}
      </p>
      <p className="mt-1 text-xs text-fg/40">
        Ad space — reserved for future advertising. No ad is shown here yet.
      </p>
    </div>
  );
}
