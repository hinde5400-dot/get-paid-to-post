import Link from "next/link";

export default function NewsPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">News</h1>
      <div className="rounded-3xl border border-fg/10 bg-card p-10">
        <p className="text-5xl">📰</p>
        <p className="mt-4 text-lg font-bold text-fg">No news yet</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fg/60">
          New campaigns, rate changes and platform updates will be posted
          here. Check back soon.
        </p>
        <Link
          href="/campaigns"
          className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-bold text-ink"
        >
          Browse campaigns
        </Link>
      </div>
    </div>
  );
}
