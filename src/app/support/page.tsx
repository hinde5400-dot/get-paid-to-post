import { BRAND_NAME } from "@/lib/constants";

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Contact Support</h1>
      <p className="text-sm leading-relaxed text-fg/60">
        Support for {BRAND_NAME} runs on Discord — join the server to open a
        support ticket, ask a question, or report a problem.
      </p>

      <div className="rounded-3xl border border-fg/10 bg-card p-6 text-center">
        <p className="text-4xl">💬</p>
        <h2 className="mt-3 text-lg font-extrabold text-fg">
          Discord Support Server
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fg/60">
          Members join the Discord server, open support tickets, and get help
          from the team.
        </p>
        {/* Honest placeholder — no fake invite link. The owner adds the real
            Discord invite URL here after creating the server. */}
        <button
          disabled
          className="mt-5 w-full cursor-not-allowed rounded-full bg-fg/10 py-3.5 text-sm font-bold text-fg/50"
        >
          Join Discord — invite link coming soon
        </button>
        <p className="mt-3 text-xs text-fg/40">
          The Discord invite link will be added by the owner once the server
          is ready. No link is shown here yet.
        </p>
      </div>

      <div className="rounded-3xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">What support can help with</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• Payout and withdrawal questions</li>
          <li>• A submission that looks wrong</li>
          <li>• Account and login problems</li>
          <li>• Campaign and brief questions</li>
        </ul>
      </div>
    </div>
  );
}
