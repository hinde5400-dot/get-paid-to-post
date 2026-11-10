import { formatUSD } from "@/lib/money";
import { getTotalPaidOut, type TopClipperEntry } from "@/lib/data";

/**
 * Win Board (Top Clippers) — a leaderboard of the creators who
 * earned the most from approved clips. Every row comes from real
 * approved submissions only, through the public leaderboard RPC
 * (migration 0036): no invented names, no invented amounts, and
 * the board is real for every visitor, not just the owner.
 *
 * Honesty rules for the total paid out (fetched live here via
 * get_total_paid_out — sum of withdrawals the owner marked paid):
 * - Winners listed: show the rows, plus the real total paid.
 * - No winners AND total paid is $0.00: the genuine zero state —
 *   "No winners yet — be the first". Both halves are verified
 *   live (no approved earnings, nothing paid out), so the $0.00
 *   is true, not a default.
 * - No winners BUT money has been paid out (past campaigns were
 *   settled and their clips auto-deleted): say so honestly and
 *   show the real total — never "nobody has earned anything".
 * - Total paid unknown (RPC unavailable, e.g. migration 0036 not
 *   applied yet): show "unavailable", never a fake $0.00.
 */
export default async function WinBoard({
  entries,
  title = "Top Clippers",
  subtitle = "Creators who earned the most from approved clips.",
}: {
  entries: TopClipperEntry[];
  title?: string;
  subtitle?: string;
}) {
  const medals = ["🥇", "🥈", "🥉", "4", "5"];
  const totalPaid = await getTotalPaidOut();
  const hasWinners = entries.length > 0;
  return (
    <section className="rounded-3xl border border-fg/10 bg-card p-6">
      <h2 className="font-display text-2xl font-black uppercase tracking-tight text-fg">
        🏆 {title}
      </h2>
      <p className="mt-1 text-sm text-fg/60">{subtitle}</p>
      {hasWinners ? (
        <>
          <ol className="mt-5 space-y-2">
            {entries.map((e, i) => (
              <li
                key={`${e.name}-${i}`}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-fg/5 px-4 py-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime/15 text-base font-black text-lime">
                  {medals[i] ?? `${i + 1}`}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-fg">
                    {e.name}
                  </span>
                  <span className="block text-xs text-fg/50">
                    {e.clips} approved clip{e.clips === 1 ? "" : "s"} ·{" "}
                    {e.views.toLocaleString()} views
                  </span>
                </span>
                <span className="font-display text-lg font-black text-lime">
                  {formatUSD(e.earned)}
                </span>
              </li>
            ))}
          </ol>
          {totalPaid !== null && (
            <p className="mt-4 text-sm font-bold text-fg/50">
              Total paid out so far:{" "}
              <span className="text-lime">{formatUSD(totalPaid)}</span>
            </p>
          )}
        </>
      ) : totalPaid === 0 ? (
        <div className="mt-5 rounded-2xl border border-fg/10 bg-ink p-8 text-center">
          <p className="text-4xl" aria-hidden>
            🏆
          </p>
          <p className="mt-3 text-lg font-black text-fg">
            No winners yet — be the first
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-fg/60">
            No clips have been approved yet, so nobody has earned
            anything. Post a clip on a live campaign and you could top
            this board.
          </p>
          <p className="mt-4 text-sm font-bold text-fg/50">
            Total paid out so far:{" "}
            <span className="text-lime">{formatUSD(0)}</span>
          </p>
        </div>
      ) : totalPaid === null ? (
        <div className="mt-5 rounded-2xl border border-fg/10 bg-ink p-8 text-center">
          <p className="text-4xl" aria-hidden>
            🏆
          </p>
          <p className="mt-3 text-lg font-black text-fg">
            Leaderboard unavailable right now
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-fg/60">
            The winners board could not be loaded. Please check back
            shortly.
          </p>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-fg/10 bg-ink p-8 text-center">
          <p className="text-4xl" aria-hidden>
            🏆
          </p>
          <p className="mt-3 text-lg font-black text-fg">
            No winners on the board right now
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-fg/60">
            Past campaigns have been settled and paid out, and their
            clips were removed after settlement. Post a clip on a live
            campaign and you could top this board.
          </p>
          <p className="mt-4 text-sm font-bold text-fg/50">
            Total paid out so far:{" "}
            <span className="text-lime">{formatUSD(totalPaid)}</span>
          </p>
        </div>
      )}
    </section>
  );
}
