import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getProfile, isOwner } from "@/lib/auth";
import {
  getCampaign,
  getAdminUsdtWallet,
  getCampaignBudgetHistory,
  getCampaignMessages,
  getCampaignRejectionReason,
  isExpiredUnpaidPending,
} from "@/lib/data";
import { formatUSD, totalToSend } from "@/lib/money";
import type { BrandMessage } from "@/lib/types";
import PaymentForm from "@/components/PaymentForm";
import BrandMessageForm from "@/components/BrandMessageForm";
import CopyButton, { CopyableText } from "@/components/CopyButton";
import DiscordButton from "@/components/DiscordButton";

/**
 * Brand payment page — shown after the brand submits a campaign.
 * The campaign stays PENDING until the brand sends the budget in
 * USDT (TRC20) to the admin wallet and pastes the Transaction ID.
 * Only the campaign's brand owner (or the admin) may see this page.
 */
export default async function BrandPaymentPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const campaign = await getCampaign(params.id);
  if (!campaign) notFound();
  const profile = await getProfile(user.id);
  const ownsIt = campaign.user_id === user.id;
  if (!ownsIt && !isOwner(profile)) notFound();

  const wallet = await getAdminUsdtWallet();
  // The chat is best-effort here: a failed message load must not
  // take down the payment page — it shows an honest note in the
  // chat area instead (getCampaignMessages THROWS on DB error,
  // Forms #26 contract).
  let messages: BrandMessage[] = [];
  let messagesError = false;
  try {
    messages = await getCampaignMessages(campaign.id);
  } catch {
    messagesError = true;
  }

  // Round-3 P1-9: budget-change banner (pending branch only).
  // Y = the budget the brand's submitted payment covered: the
  // earliest history row's old_budget_total (the budget before
  // the first edit — the amount the TxID was sent against).
  // X = current budget_total, Z = X − Y; the banner shows only
  // when Z > 0 and a TxID is on file. The extra carries the same
  // 15% fee on top as the payment page's own math. Best-effort:
  // a failed history read hides the banner, never the page.
  // (Migration 0039 lets a brand read its own campaign's history
  // rows — the table was owner-only before that.)
  let budgetHistory: Awaited<
    ReturnType<typeof getCampaignBudgetHistory>
  >[string] = [];
  try {
    budgetHistory =
      (await getCampaignBudgetHistory([campaign.id]))[campaign.id] ?? [];
  } catch {
    budgetHistory = [];
  }
  const earliestBudgetChange =
    budgetHistory.length > 0
      ? budgetHistory[budgetHistory.length - 1]
      : null;
  const paidBudget =
    earliestBudgetChange != null
      ? Number(earliestBudgetChange.old_budget_total ?? 0)
      : null;
  const budgetIncrease =
    paidBudget != null ? campaign.budget_total - paidBudget : 0;
  const showBudgetChangeBanner =
    Boolean(campaign.payment_tx_id?.trim()) && budgetIncrease > 0;

  if (campaign.status === "live") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-3xl border border-lime/40 bg-card p-8 text-center">
          <p className="text-4xl">🎉</p>
          <h1 className="mt-3 text-xl font-black text-fg">
            Your campaign is already live
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            Payment was verified and &ldquo;{campaign.title}&rdquo; is now
            live on Discover.
          </p>
          <Link
            href={`/campaign/${campaign.id}`}
            className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            View campaign
          </Link>
        </div>
        <BrandChat
          campaignId={campaign.id}
          messages={messages}
          messagesError={messagesError}
          viewerIsAdmin={isOwner(profile)}
          brandName={campaign.brand_name}
        />
      </div>
    );
  }

  if (campaign.status === "rejected") {
    // The rejection reason lives in the brand chat thread (the
    // admin posts it there on reject).
    const rejectionReason = await getCampaignRejectionReason(campaign.id);
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-3xl border border-fg/10 bg-card p-8 text-center">
          <h1 className="text-xl font-black text-fg">
            This campaign was rejected
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            The admin did not approve &ldquo;{campaign.title}&rdquo;.
            {rejectionReason ? (
              <>
                {" "}
                Reason:{" "}
                <span className="font-bold text-fg">{rejectionReason}</span>
              </>
            ) : null}{" "}
            If you already sent the budget, contact the admin on
            Discord about your refund.
          </p>
          <div className="mx-auto mt-5 max-w-sm">
            <DiscordButton />
          </div>
        </div>
        <BrandChat
          campaignId={campaign.id}
          messages={messages}
          messagesError={messagesError}
          viewerIsAdmin={isOwner(profile)}
          brandName={campaign.brand_name}
        />
      </div>
    );
  }

  // Round-3 P1-6: an expired unpaid pending (7+ days, no TxID)
  // shows an expired state — the payment form is hidden, so the
  // brand cannot pay for a campaign that can no longer go live.
  if (campaign.status === "pending" && isExpiredUnpaidPending(campaign)) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-3xl border border-red-500/40 bg-card p-8 text-center">
          <h1 className="text-xl font-black text-fg">
            This campaign expired
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            &ldquo;{campaign.title}&rdquo; was never funded within 7 days,
            so it expired and can no longer be paid for. Create a new
            campaign to start again.
          </p>
          <Link
            href="/brands"
            className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
          >
            Create a new campaign
          </Link>
        </div>
        <BrandChat
          campaignId={campaign.id}
          messages={messages}
          messagesError={messagesError}
          viewerIsAdmin={isOwner(profile)}
          brandName={campaign.brand_name}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="mx-auto max-w-lg rounded-3xl border border-lime/40 bg-card p-6 md:p-8">
        <h1 className="text-xl font-black leading-snug text-fg">
          Thanks! To make your campaign LIVE, send your Budget in USDT to
          admin wallet and paste Transaction ID here.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg/60">
          Campaign:{" "}
          <span className="font-bold text-fg">{campaign.title}</span> —{" "}
          {campaign.brand_name}
        </p>

        {/* Round-3 P1-9: the budget changed after the brand paid —
            the old TxID covered a smaller amount. */}
        {showBudgetChangeBanner && paidBudget != null && (
          <div className="mt-5 rounded-2xl border border-amber-400/60 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200">
            <span className="font-black">
              Budget changed to {formatUSD(campaign.budget_total)}
            </span>{" "}
            — your submitted payment covered {formatUSD(paidBudget)};
            send the extra {formatUSD(budgetIncrease)} + 15% fee (
            {formatUSD(totalToSend(budgetIncrease))} total) so the
            campaign can go live on the new budget.
          </div>
        )}

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-fg/5 px-4 py-3">
            <span className="text-sm font-bold text-fg/60">
              Campaign budget
            </span>
            <span className="text-sm font-black text-fg">
              {formatUSD(campaign.budget_total)} USDT
            </span>
          </div>
          {/* Fee split: 15% flat platform fee, charged ON TOP of the
              budget. The campaign runs on the full budget — the
              creators pool is the whole budget_total. This is the
              one place $ amounts are shown for the budget. */}
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-fg/5 px-4 py-3">
            <span className="text-sm font-bold text-fg/60">
              Platform fee (15%)
            </span>
            <span className="text-sm font-black text-fg">
              {formatUSD(campaign.platform_fee)} USDT
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-fg/5 px-4 py-3">
            <span className="text-sm font-bold text-fg/60">
              Creators pool (full budget)
            </span>
            <span className="text-sm font-black text-fg">
              {formatUSD(campaign.budget_total)} USDT
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-fg/5 px-4 py-3">
            <span className="text-sm font-bold text-fg/60">
              Total to send
            </span>
            <span className="font-display text-lg font-black text-lime">
              {formatUSD(campaign.budget_total + campaign.platform_fee)}{" "}
              USDT
            </span>
          </div>
          <p className="text-xs leading-relaxed text-fg/50">
            You send the total above: your campaign budget plus a 15%
            platform fee on top. The campaign runs on the full budget
            — creators are paid from the whole pool, per verified
            view.
          </p>
          {/* Red total notice (Turn's decision 2026-11-11): the
              full amount must jump out — the campaign goes live
              only after the WHOLE total arrives. */}
          <p className="rounded-2xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm font-black leading-relaxed text-red-200">
            Send the full{" "}
            {formatUSD(campaign.budget_total + campaign.platform_fee)}{" "}
            USDT — your campaign goes live only after the FULL amount
            arrives in the admin wallet. Sending less will delay your
            launch.
          </p>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-fg/5 px-4 py-3">
            <span className="text-sm font-bold text-fg/60">Network</span>
            <span className="text-sm font-black text-fg">USDT TRC20</span>
          </div>
          <div className="rounded-2xl bg-fg/5 px-4 py-3">
            <p className="text-sm font-bold text-fg/60">
              Admin Wallet Address
            </p>
            {wallet ? (
              <div className="mt-2 flex items-start justify-between gap-3">
                {/* Tapping the address itself copies it too — the
                    Copy button is not the only way (friend's brand
                    test, 2026-11-11: the button was never reached). */}
                <CopyableText
                  text={wallet}
                  className="min-w-0 break-all text-left font-mono text-sm font-bold text-fg"
                >
                  {wallet}
                </CopyableText>
                <CopyButton text={wallet} label="Copy" />
              </div>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-fg/70">
                The admin wallet address hasn&apos;t been set yet — contact
                the admin on Discord to get it.
              </p>
            )}
          </div>
          {/* TRC20-only warning (Turn's decision 2026-11-11): the
              brand must send USDT on the TRON network only, to this
              exact address. Any other coin or network loses the
              funds forever — this is unmissable on purpose. */}
          <div className="rounded-2xl border-2 border-red-500 bg-red-500/15 px-4 py-3">
            <p className="text-sm font-black leading-relaxed text-red-200">
              ⚠️ Send ONLY USDT on the TRON network (TRC20) to this exact
              address.
            </p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-red-200/90">
              Do NOT send any other coin, and do NOT use any other
              network — for example ERC20 or any other chain. Funds
              sent the wrong way are lost forever and cannot be
              recovered.
            </p>
          </div>
        </div>

        <div className="mt-6">
          {wallet ? (
            <PaymentForm
              campaignId={campaign.id}
              existingTxId={campaign.payment_tx_id ?? null}
            />
          ) : (
            <div className="mx-auto max-w-sm">
              <DiscordButton />
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-sm leading-relaxed text-fg/60">
          After the admin verifies your payment, your campaign will go
          live.
        </p>
        <p className="mt-3 rounded-xl bg-amber-500/10 px-4 py-3 text-center text-sm font-semibold leading-relaxed text-amber-200">
          Unpaid pending campaigns expire after 7 days
          {campaign.created_at
            ? ` — this one expires ${new Date(
                new Date(campaign.created_at).getTime() +
                  7 * 24 * 60 * 60 * 1000
              ).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}`
            : ""}
          . Chatting alone does not count as payment.
        </p>
      </div>

      <BrandChat
        campaignId={campaign.id}
        messages={messages}
        messagesError={messagesError}
        viewerIsAdmin={isOwner(profile)}
        brandName={campaign.brand_name}
      />
    </div>
  );
}

/**
 * Private chat with the admin — text messages and direct proof
 * screenshot uploads, locked to this campaign. Wide,
 * WhatsApp-style thread: tall scrollable message area with the
 * brand's messages on the right and admin replies on the left.
 * Rendered on the pending page AND on the live / rejected pages:
 * a brand may also follow up after the campaign goes live, and a
 * rejected brand still needs to reach the admin (e.g. about a
 * refund) — the old live/rejected branches returned early with
 * no chat at all.
 */
function BrandChat({
  campaignId,
  messages,
  messagesError,
  viewerIsAdmin,
  brandName,
}: {
  campaignId: string;
  messages: BrandMessage[];
  messagesError: boolean;
  viewerIsAdmin: boolean;
  brandName: string;
}) {
  return (
    <div
      id="brand-chat"
      className="scroll-mt-6 overflow-hidden rounded-3xl border border-fg/10 bg-card"
    >
      <div className="flex items-center gap-3 border-b border-fg/10 px-5 py-4 md:px-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime text-lg font-black text-black">
          A
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-black leading-tight text-fg">
            Chat with the admin / Send proof
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-fg/50">
            <span className="h-2 w-2 rounded-full bg-lime" />
            Private — only you and the admin can see this chat
          </p>
        </div>
      </div>
      <p className="px-5 pt-4 text-sm leading-relaxed text-fg/60 md:px-6">
        Tell the admin you sent the budget and upload your payment
        screenshot here as proof. The admin can reply to you in this
        chat.
      </p>
      {messagesError ? (
        <p className="px-5 pb-5 pt-4 text-sm font-semibold text-red-300 md:px-6 md:pb-6">
          Couldn&apos;t load the chat — please refresh the page and try
          again.
        </p>
      ) : (
        <div className="px-5 pb-5 pt-4 md:px-6 md:pb-6">
          <BrandMessageForm
            campaignId={campaignId}
            initialMessages={messages}
            viewerIsAdmin={viewerIsAdmin}
            brandName={brandName}
          />
        </div>
      )}
    </div>
  );
}
