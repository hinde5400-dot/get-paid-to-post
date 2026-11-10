import Link from "next/link";
import { BRAND_NAME } from "@/lib/constants";
import { CAMPAIGN_CATEGORIES as CATEGORIES } from "@/lib/types";

// NOTE: this page only restates rules that are already implemented
// in the code or written in the Terms — it invents no rule, number
// or promise. Sources: Terms (§3–§8), How It Works, home FAQ,
// VIDEO_RULES in lib/validate, lib/constants, lib/fraud (bot ladder),
// lib/engagement (1% minimum) and the P0/P1 campaign, settlement
// and auto-delete flows.

const SECTIONS = [
  { id: "who-can-join", label: "Who can join" },
  { id: "video-rules", label: "Video rules" },
  { id: "submitting", label: "Submitting clips" },
  { id: "earnings", label: "How earnings work" },
  { id: "fees", label: "Fees & withdrawals" },
  { id: "budget", label: "Budget display" },
  { id: "settlement", label: "Settlement timeline" },
  { id: "anti-fraud", label: "Anti-fraud & appeals" },
  { id: "brands", label: "For brands" },
  { id: "ended", label: "Ended campaigns" },
  { id: "categories", label: "Categories" },
] as const;

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-fg/10 bg-card p-6"
    >
      <h2 className="text-lg font-extrabold text-fg">
        {n}. {title}
      </h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-fg/70">
        {children}
      </div>
    </section>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return <p>• {children}</p>;
}

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">
        Rules
      </h1>
      <p className="text-sm text-fg/50">Last updated: 10 November 2026</p>
      <p className="text-sm leading-relaxed text-fg/70">
        Every rule on {BRAND_NAME} in one place — for creators and for
        brands. Nothing here is new: it is the same rules already in the{" "}
        <Link href="/terms" className="font-bold text-lime hover:underline">
          Terms of Service
        </Link>
        ,{" "}
        <Link
          href="/how-it-works"
          className="font-bold text-lime hover:underline"
        >
          How It Works
        </Link>{" "}
        and the submit form, collected on a single page. If this page and
        the Terms ever disagree, the Terms apply.
      </p>

      <nav className="rounded-2xl border border-fg/10 bg-card p-6">
        <p className="text-xs font-black uppercase tracking-widest text-fg/50">
          On this page
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-block rounded-full border border-fg/15 px-3 py-1.5 text-xs font-bold text-fg/70 transition hover:border-lime hover:text-lime"
              >
                {i + 1}. {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="who-can-join" n="1" title="Who can join">
        <Rule>
          Anyone can sign up and browse campaigns — you sign up with email
          and password, or continue with Google. No phone, no address. One account per person.
        </Rule>
        <Rule>
          There is no follower minimum. You are paid per view, so a small
          account with a great clip can earn just like a big one.
        </Rule>
        <Rule>
          <strong className="text-fg">Payouts are for creators aged 18 or older.</strong>{" "}
          By signing up you confirm you are 18 or older to receive
          payouts.
        </Rule>
        <Rule>
          Creators never pay anything to join, post, or earn.
        </Rule>
      </Section>

      <Section id="video-rules" n="2" title="Video rules">
        <p>
          Every clip you submit must follow these rules, and the campaign
          brief:
        </p>
        <Rule>Vertical video only — 9:16 format.</Rule>
        <Rule>Add captions to your clip.</Rule>
        <Rule>Hook viewers in the first 3 seconds.</Rule>
        <Rule>Follow the campaign brief exactly.</Rule>
        <Rule>Use only your own original content.</Rule>
        <Rule>No fake views, likes or engagement.</Rule>
        <Rule>
          Only TikTok, Instagram and YouTube links are accepted — links
          from tiktok.com, instagram.com or youtube.com.
        </Rule>
      </Section>

      <Section id="submitting" n="3" title="Submitting clips">
        <Rule>
          Submit up to 2 of TikTok, Instagram and YouTube together as one
          bundle (a single-platform campaign needs only 1 link) — each clip
          is then reviewed and paid on its own.
        </Rule>
        <Rule>
          Proof is required: at least one originality-proof screenshot
          link showing the video is your own (up to 3). A submission
          without proof is not accepted.
        </Rule>
        <Rule>
          One clip per platform every 2 hours — across all campaigns
          on that platform, not per campaign. After you submit on
          TikTok, your next TikTok submit on any campaign is 2 hours
          later, and the same for Instagram and YouTube. A rejected or
          duplicate submission does not start the cooldown.
        </Rule>
        <Rule>
          Submit your link within 30 minutes of posting the video — a link
          submitted more than 30 minutes after the video was posted is not
          accepted. Instagram links are hand-checked by the admin (no
          automatic check yet), so the 30-minute rule is checked by hand
          for Instagram.
        </Rule>
        <Rule>
          Up to <strong className="text-fg">15 approved clips per platform per campaign</strong>{" "}
          (TikTok 15, Instagram 15, YouTube 15). Rejected clips do not
          count toward the 15.
        </Rule>
        <Rule>
          A rejected clip is done — there is no resubmit. Post a new clip
          if you still have slots left.
        </Rule>
        <Rule>
          Submitting the same link twice — yours or someone else&apos;s —
          is a duplicate and is rejected. Submitting someone else&apos;s
          content will lead to the submission being rejected.
        </Rule>
        <Rule>
          Submissions stay Pending at $0 until approved.
        </Rule>
      </Section>

      <Section id="earnings" n="4" title="How earnings work">
        <Rule>
          Earnings are <strong className="text-fg">views only</strong> — you
          are paid the campaign&apos;s rate per 1,000 verified views.{" "}
          <strong className="text-fg">There is no base pay per post.</strong>
        </Rule>
        <Rule>
          The brand sets one rate per 1,000 views for the whole campaign —
          the same rate applies on TikTok, Instagram and YouTube, shown on
          the campaign.
        </Rule>
        <Rule>
          Earnings per clip = views / 1,000 × the rate — capped by the
          campaign&apos;s maximum payout per post and by the campaign&apos;s
          remaining budget. A viral clip never pays more than the cap.
        </Rule>
        <Rule>
          Views are tracked while your clip is pending, for up to 14
          days after you submit, and only verified views count — views
          the platform owner has checked and confirmed as real views
          from real people. Once approved, earnings are fixed on the
          views at approval — later views don&apos;t add earnings.
        </Rule>
        <Rule>
          Every clip needs at least{" "}
          <strong className="text-fg">1,000 views to earn</strong> — a clip
          below 1,000 views cannot be approved. A brand may set a higher
          minimum views per clip. When set, it is shown on the campaign:
          a clip below the campaign&apos;s minimum cannot be approved.
        </Rule>
        <Rule>
          Approved earnings move to your wallet after a 72-hour hold.
        </Rule>
      </Section>

      <Section id="fees" n="5" title="Fees & withdrawals">
        <Rule>
          <strong className="text-fg">Withdrawal fee: 5%.</strong> The
          5% fee is rounded to the nearest cent — you receive the
          amount after the fee.
        </Rule>
        <Rule>
          <strong className="text-fg">Minimum withdrawal: $15.</strong>
        </Rule>
        <Rule>
          Payouts are USDT only — USDT (TRC20). Bank,
          Wise, PayPal, JazzCash and Easypaisa are not offered.
        </Rule>
        <Rule>
          Approved earnings sit in a <strong className="text-fg">72-hour hold</strong>{" "}
          before they become withdrawable. Payouts are processed by the
          platform owner from the funded campaign budget.
        </Rule>
      </Section>

      <Section id="budget" n="6" title="Budget display">
        <Rule>
          Campaign cards show the budget as{" "}
          <strong className="text-fg">% used only — never a $ amount</strong>.
          The bar goes green → yellow → red → dark red as the budget is
          used up, and at 100% used the campaign ends.
        </Rule>
      </Section>

      <Section id="settlement" n="7" title="Settlement timeline">
        <p>
          Approved earnings go into the 72-hour hold as soon as they are
          approved, during the campaign. After a campaign ends, the final
          settlement timeline is:
        </p>
        <Rule>
          <strong className="text-fg">Campaign ends → 3-day re-check window.</strong>{" "}
          We review suspicious videos, and an already-approved video can
          still be rejected if fake or bot views show up.
        </Rule>
        <Rule>
          <strong className="text-fg">The 72-hour hold starts at approval.</strong>{" "}
          Approved earnings enter a 72-hour hold as soon as they are
          approved — even while the campaign is still running — so by the
          time the campaign ends, most holds have already matured. The
          hold does not start after the campaign ends.
        </Rule>
        <Rule>
          <strong className="text-fg">Then payout.</strong> Payouts are
          made manually — withdraw in USDT (TRC20 only) from $15.
          From campaign end to payout:{" "}
          <strong className="text-fg">about 1 week in total</strong>.
        </Rule>
        <Rule>
          The campaign, its proofs and its chat are deleted 1 day after
          the last hold matures, never earlier than 7 days after the
          campaign ends. Wallet and withdrawal records are never deleted.
        </Rule>
      </Section>

      <Section id="anti-fraud" n="8" title="Anti-fraud & appeals">
        <Rule>
          Only real views from real people count.{" "}
          <strong className="text-fg">
            Fake engagement will lead to your account being strictly blocked
            or banned.
          </strong>
        </Rule>
        <Rule>
          Every clip must have at least a{" "}
          <strong className="text-fg">1% engagement rate</strong> — (likes +
          comments) / views. Shares and saves never count toward it.
        </Rule>
        <Rule>
          Every rejection shows its reason — for example bot views, brief
          mismatch, wrong content or duplicate — so you always know why a
          clip was rejected.
        </Rule>
        <Rule>
          Bot-view rejections add up:{" "}
          <strong className="text-fg">6 = concern</strong> (the owner is
          alerted and watches the account),{" "}
          <strong className="text-fg">10 = flagged</strong>, and{" "}
          <strong className="text-fg">one more bot-view rejection after the
          flag = the account is banned automatically</strong>.
        </Rule>
        <Rule>
          If a submission is rejected after it was approved, its earnings
          are reversed — taken back from your Pending Balance first, then
          from your Withdrawable Balance — and returned to the campaign
          budget. If the amount was already withdrawn, it cannot be
          clawed back.
        </Rule>
        <Rule>
          If you think a rejection or flag was wrong, appeal through
          Discord support. A person will review your appeal. We aim to
          reply within 10 business days.
        </Rule>
      </Section>

      <Section id="brands" n="9" title="For brands">
        <Rule>
          A campaign stays <strong className="text-fg">pending</strong>{" "}
          until its budget plus the 15% platform fee is sent in USDT and
          verified. The admin approves the campaign — and it goes live —
          only after verifying the payment.
        </Rule>
        <Rule>
          You set your own budget — any amount above $0 — and your own
          single rate per 1,000 views for the whole campaign, any rate
          above $0. You pay only for verified views.
        </Rule>
        <Rule>
          Your budget is funded before your campaign goes live. We never
          spend your budget on anything else, and we never charge you for
          views that were not verified. Your budget is tracked per
          campaign and only spent on approved views — ask the admin on
          Discord for a payout record for your campaign.
        </Rule>
        <Rule>
          Clips are rejected against the requirements you stated in
          the campaign — for example brief mismatch or wrong content.
          A clip can still be rejected for fake or bot views, below-1%
          engagement, or duplicates, even if it follows the brief and
          the video rules.
        </Rule>
        <Rule>
          Unspent budget stays yours: ask for a refund through Discord
          support — the owner sends it manually in USDT. We aim to send
          it within 5–7 business days of your request.
        </Rule>
        <Rule>
          Once a published clip is approved, you may repost and use it to
          promote that campaign. If a clip is not approved, you receive no
          right to use it. The creator keeps ownership of their original
          work.
        </Rule>
      </Section>

      <Section id="ended" n="10" title="Ended campaigns">
        <Rule>
          A campaign that has ended stays visible with its status while it
          is in its settlement window — no new submissions, while
          re-checks and payouts finish.
        </Rule>
        <Rule>
          <strong className="text-fg">
            The campaign is automatically deleted 1 day after the last
            hold matures
          </strong>{" "}
          — its record, its proofs and its chat, all of it. Nothing is
          deleted earlier than 7 days after the campaign ended. Your
          wallet and withdrawal history are never deleted.
        </Rule>
      </Section>

      <Section id="categories" n="11" title="Categories">
        <p>
          Every campaign has exactly one category, shown on its card and
          usable as a filter when browsing:
        </p>
        <ul className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <li
              key={c}
              className="rounded-full bg-lime/15 px-3 py-1.5 text-xs font-black text-lime"
            >
              {c}
            </li>
          ))}
        </ul>
        <p className="text-fg/50">
          Categories are {CATEGORIES.join(", ")}.
        </p>
      </Section>

      <div className="rounded-2xl border border-fg/10 bg-card p-6 text-center">
        <p className="text-sm font-bold text-fg">
          Still have a question about a rule?
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-fg/60">
          Ask on Discord — support runs there, and a person will answer.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/support"
            className="rounded-full bg-lime px-6 py-3 text-sm font-bold text-ink transition hover:bg-limedark"
          >
            Contact Support
          </Link>
          <Link
            href="/terms"
            className="rounded-full border border-fg/25 px-6 py-3 text-sm font-bold text-fg transition hover:border-lime hover:text-lime"
          >
            Terms of Service →
          </Link>
        </div>
      </div>
    </div>
  );
}
