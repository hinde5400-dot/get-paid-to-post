import Link from "next/link";

const ACTIONS = [
  {
    href: "/campaigns",
    label: "Browse campaigns",
    desc: "Find a funded campaign and join your next shoot.",
    icon: "◎",
  },
  {
    href: "/my-posts",
    label: "My Posts",
    desc: "Check your submissions, views and earnings.",
    icon: "🎬",
  },
  {
    href: "/earnings",
    label: "Earnings",
    desc: "Balance, 72-hour hold and withdrawals.",
    icon: "$",
  },
  {
    href: "/support",
    label: "Contact Support",
    desc: "Questions about a campaign or payout? Ask here.",
    icon: "✉",
  },
];

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">
        Inbox
      </h1>

      {/* Designed empty state */}
      <div className="rounded-3xl border border-fg/10 bg-card p-8 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-lime/15 text-3xl">
          ✉️
        </span>
        <p className="mt-4 font-display text-xl font-black tracking-tight text-fg">
          No messages yet
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fg/60">
          Messages about your submissions, approvals and payouts will appear
          here. Nothing has arrived yet.
        </p>
        <Link
          href="/campaigns"
          className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
        >
          Browse campaigns
        </Link>
      </div>

      {/* What lands here */}
      <div className="rounded-3xl border border-fg/10 bg-card p-6">
        <h2 className="font-display text-base font-black tracking-tight text-fg">
          What you will get here
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>✓ Submission approved or rejected — with the reason.</li>
          <li>✓ Earnings moved from the 72-hour hold to your balance.</li>
          <li>✓ Withdrawal paid out, or a problem that needs your input.</li>
        </ul>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 font-display text-base font-black uppercase tracking-tight text-fg">
          Quick actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="flex items-start gap-3 rounded-2xl border border-fg/10 bg-card p-4 transition hover:border-lime/60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime/15 text-lg">
                {a.icon}
              </span>
              <span>
                <span className="block font-bold text-fg">{a.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-fg/50">
                  {a.desc}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
