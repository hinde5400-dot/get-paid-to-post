import { BRAND_NAME } from "@/lib/constants";
import DiscordButton from "@/components/DiscordButton";

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Contact Support</h1>
      <p className="text-sm leading-relaxed text-fg/60">
        Support Tickets, Announcements, and Community — All on Discord.
        Support for {BRAND_NAME} runs on Discord only — there is no live
        chat on the site. Join the server to open a support ticket, ask a
        question, or report a problem.
      </p>

      <div className="rounded-3xl border border-fg/10 bg-card p-6 text-center">
        <p className="text-4xl">💬</p>
        <h2 className="mt-3 text-lg font-extrabold text-fg">
          Discord Support Server
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fg/60">
          Members join the Discord server, open support tickets, and get help
          from the team. Support tickets are handled on Discord — open a
          ticket in the server and the team will help you.
        </p>
        <DiscordButton className="mx-auto mt-5 max-w-sm" />
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
