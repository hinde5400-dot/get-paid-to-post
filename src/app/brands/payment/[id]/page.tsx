import type { Metadata } from "next";
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
  UNPAID_PENDING_EXPIRY_MS,
} from "@/lib/data";
import { getServerClient } from "@/lib/supabase/server";
import { formatUSD, platformFeeFor, totalToSend } from "@/lib/money";
import type { BrandMessage } from "@/lib/types";
import PaymentForm from "@/components/PaymentForm";
import BrandMessageForm from "@/components/BrandMessageForm";
import BrandCampaignEditForm from "@/components/BrandCampaignEditForm";
import RefundRequestButton from "@/components/RefundRequestButton";
import PaymentPageAutoRefresh from "@/components/PaymentPageAutoRefresh";
import CopyButton, { CopyableText } from "@/components/CopyButton";
import DiscordButton from "@/components/DiscordButton";

export const metadata: Metadata = {
  title: "Campaign payment",
  description:
    "Fund your Get Paid To Post campaign — send your budget in USDT (TRC20) and share your transaction ID to take your campaign live.",
};

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

  // Round-3 P1-9, fixed in Round-4 (P1-B2 / P2-B1): the budget
  // the brand's submitted payment covered is the old_budget_total
  // of the EARLIEST edit made AFTER the payment was submitted —
  // history rows carry created_at, and the payment time is
  // payment_tx_submitted_at (migration 0038; a legacy TxID row
  // with no timestamp falls back to the campaign's creation
  // date, the same fallback the expiry rule uses). An edit made
  // BEFORE the brand paid trips nothing: the brand paid the new
  // budget. Only a post-payment INCREASE asks for extra money;
  // a post-payment DECREASE means the brand overpaid, and the
  // difference is refunded on request. Best-effort: a failed
  // history read hides the banners, never the page.
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
  const hasTxId = Boolean(campaign.payment_tx_id?.trim());
  const paymentTimeRaw =
    campaign.payment_tx_submitted_at ?? campaign.created_at ?? "";
  const paymentTimeMs = Number.isFinite(
    new Date(paymentTimeRaw).getTime()
  )
    ? new Date(paymentTimeRaw).getTime()
    : 0;
  // History arrives newest-first; the earliest post-payment edit
  // is the last row whose created_at is after the payment time.
  const postPaymentEdits = budgetHistory.filter(
    (h) => new Date(h.created_at).getTime() > paymentTimeMs
  );
  const earliestPostPaymentEdit =
    postPaymentEdits.length > 0
      ? postPaymentEdits[postPaymentEdits.length - 1]
      : null;
  const paidBudget =
    earliestPostPaymentEdit != null
      ? Number(earliestPostPaymentEdit.old_budget_total ?? 0)
      : null;
  const budgetDelta =
    paidBudget != null ? campaign.budget_total - paidBudget : 0;
  const showBudgetIncreaseBanner =
    hasTxId && paidBudget != null && budgetDelta > 0;
  const showOverpaymentBanner =
    hasTxId && paidBudget != null && budgetDelta < 0;
  // Overpaid = what the brand sent (budget + 15% fee on the
  // amount the TxID covered) minus what it now owes on the
  // lowered budget. Fee split is recomputed (P2-B3), never read
  // from the stored platform_fee column.
  const overpaidAmount =
    paidBudget != null
      ? Math.max(
          0,
          Math.round(
            (totalToSend(paidBudget) - totalToSend(campaign.budget_total)) *
              100
          ) / 100
        )
      : 0;
  // Fee split, recomputed from the live budget (P2-B3): the
  // stored platform_fee column is a cache, and a stale fee (e.g.
  // after a budget edit whose fee write failed) must never set
  // the amount the brand is asked to send.
  const platformFee = platformFeeFor(campaign.budget_total);
  const totalDue = totalToSend(campaign.budget_total);
  // Expiry clock (P1-B1): the same clock as
  // isExpiredUnpaidPending — payment_tx_submitted_at + 7d when a
  // TxID is on file, else created_at + 7d.
  const expiryBaseRaw =
    hasTxId && campaign.payment_tx_submitted_at
      ? campaign.payment_tx_submitted_at
      : campaign.created_at;
  const expiryDate = expiryBaseRaw
    ? new Date(
        new Date(expiryBaseRaw).getTime() + UNPAID_PENDING_EXPIRY_MS
      )
    : null;
  const expiryLabel = expiryDate
    ? expiryDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  // Refund state for the rejected branch (P2-B5): an open request
  // in refund_requests, if the table exists yet. Best-effort —
  // a missing table or a blocked read just means "no request
  // known"; the button still works (the API answers 503 honestly
  // when the table is missing).
  let refundRequested = false;
  if (campaign.status === "rejected" && hasTxId) {
    try {
      const supabase = getServerClient();
      if (supabase) {
        const { data } = await supabase
          .from("refund_requests")
          .select("id")
          .eq("campaign_id", campaign.id)
          .eq("status", "requested")
          .limit(1);
        refundRequested = Boolean(data && data.length > 0);
      }
    } catch {
      refundRequested = false;
    }
  }

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
            {hasTxId ? (
              <>
                You already sent{" "}
                {formatUSD(
                  totalToSend(paidBudget ?? campaign.budget_total)
                )}{" "}
                (
                {formatUSD(paidBudget ?? campaign.budget_total)} budget
                +{" "}
                {formatUSD(
                  platformFeeFor(paidBudget ?? campaign.budget_total)
                )}{" "}
                platform fee). Your budget is refunded on request —
                the 15% platform fee is not refundable.
              </>
            ) : (
              <>If you already sent the budget, contact the admin on
              Discord about your refund.</>
            )}
          </p>
          {hasTxId && (
            <div className="mx-auto mt-5 max-w-md space-y-3 text-left">
              <div className="rounded-2xl bg-fg/5 px-4 py-3">
                <p className="text-xs font-bold text-fg/50">
                  Amount paid
                </p>
                <p className="mt-1 text-sm font-black text-fg">
                  {formatUSD(
                    totalToSend(paidBudget ?? campaign.budget_total)
                  )}{" "}
                  USDT
                  <span className="ml-2 text-xs font-semibold text-fg/50">
                    (
                    {formatUSD(paidBudget ?? campaign.budget_total)}{" "}
                    budget refundable ·{" "}
                    {formatUSD(
                      platformFeeFor(paidBudget ?? campaign.budget_total)
                    )}{" "}
                    fee not refundable)
                  </span>
                </p>
                <p className="mt-2 break-all font-mono text-xs font-bold text-fg/80">
                  TxID: {campaign.payment_tx_id}
                </p>
                <a
                  href={`https://tronscan.org/#/transaction/${campaign.payment_tx_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs font-bold text-lime hover:underline"
                >
                  Verify on Tronscan ↗
                </a>
              </div>
              <RefundRequestButton
                campaignId={campaign.id}
                amount={paidBudget ?? campaign.budget_total}
                alreadyRequested={refundRequested}
              />
            </div>
          )}
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
      {/* Round-4 P2-B7: while pending, refresh the page state
          every 30s (and on window focus) so an approval / reply
          shows without a manual reload. */}
      <PaymentPageAutoRefresh />
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

        {/* Round-3 P1-9, fixed in Round-4 (P1-B2): the budget was
            RAISED after the brand paid — the old TxID covered a
            smaller amount. Only shows when the earliest edit after
            the payment raised the budget; a pre-payment edit never
            triggers it. */}
        {showBudgetIncreaseBanner && paidBudget != null && (
          <div className="mt-5 rounded-2xl border border-amber-400/60 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200">
            <span className="font-black">
              Budget changed to {formatUSD(campaign.budget_total)}
            </span>{" "}
            — your submitted payment covered {formatUSD(paidBudget)};
            send the extra {formatUSD(budgetDelta)} + 15% fee (
            {formatUSD(totalToSend(budgetDelta))} total) so the
            campaign can go live on the new budget.
          </div>
        )}

        {/* Round-4 P2-B1: the budget was LOWERED after the brand
            paid — the brand overpaid, and the difference is
            refunded on request (the admin approves without an
            "extra received" confirmation: a decrease is safe). */}
        {showOverpaymentBanner && paidBudget != null && (
          <div className="mt-5 rounded-2xl border border-sky-400/60 bg-sky-500/10 px-4 py-3 text-sm leading-relaxed text-sky-200">
            <span className="font-black">
              Budget lowered to {formatUSD(campaign.budget_total)}
            </span>{" "}
            — your submitted payment covered {formatUSD(paidBudget)},
            so you overpaid {formatUSD(overpaidAmount)}. Ask the
            admin for a refund of the difference (in the chat below
            or on Discord) — approving the campaign is not held up
            by this.
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
              one place $ amounts are shown for the budget. The fee
              and total are recomputed from the live budget (P2-B3),
              never read from the stored platform_fee column. */}
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-fg/5 px-4 py-3">
            <span className="text-sm font-bold text-fg/60">
              Platform fee (15%)
            </span>
            <span className="text-sm font-black text-fg">
              {formatUSD(platformFee)} USDT
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
              {formatUSD(totalDue)}{" "}
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
              only after the WHOLE total arrives. Hidden while no
              admin wallet is set (P2-B4): ordering payment to an
              address that isn't shown makes no sense. */}
          {wallet && (
            <p className="rounded-2xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm font-black leading-relaxed text-red-200">
              Send the full {formatUSD(totalDue)} USDT — your campaign
              goes live only after the FULL amount arrives in the
              admin wallet. Sending less will delay your launch.
            </p>
          )}
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
              funds forever — this is unmissable on purpose. Hidden
              while no admin wallet is set (P2-B4). */}
          {wallet && (
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
          )}
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
        {/* Round-4 P1-B1: the expiry date runs on the same clock
            as isExpiredUnpaidPending — 7 days from the payment
            submission when a TxID is on file, 7 days from creation
            when there is none — and the note says which clock it
            is, so a paid brand never reads a past date and pays
            twice. */}
        <p className="mt-3 rounded-xl bg-amber-500/10 px-4 py-3 text-center text-sm font-semibold leading-relaxed text-amber-200">
          {hasTxId
            ? `Your payment was submitted — this campaign stays payable until ${expiryLabel ?? "7 days after you submitted the payment"}.`
            : `Unpaid pending campaigns expire after 7 days${expiryLabel ? ` — this one expires ${expiryLabel} (7 days from creation)` : ""}.`}{" "}
          Chatting alone does not count as payment.
        </p>
      </div>

      {/* Round-4 P1-B4: fix a typo'd rate, brief, requirements or
          Drive link while the campaign is still pending — no
          reject → recreate → repay. The admin sees the same edit
          on the campaign card in /admin. */}
      {!isOwner(profile) && (
        <BrandCampaignEditForm campaign={campaign} />
      )}

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
