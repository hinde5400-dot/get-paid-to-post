import Link from "next/link";

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-white">Inbox</h1>
      <div className="rounded-3xl border border-white/10 bg-card p-10">
        <p className="text-5xl">✉️</p>
        <p className="mt-4 text-lg font-bold text-white">No messages yet</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/60">
          Messages about your submissions, approvals and payouts will appear
          here. Nothing has arrived yet.
        </p>
        <Link
          href="/campaigns"
          className="mt-5 inline-block rounded-full bg-sun px-6 py-3 text-sm font-bold text-ink"
        >
          Browse campaigns
        </Link>
      </div>
    </div>
  );
}
