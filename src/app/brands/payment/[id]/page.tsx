import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getProfile, isOwner } from "@/lib/auth";
import { getCampaign, getAdminUsdtWallet, getCampaignMessages } from "@/lib/data";
import { formatUSD } from "@/lib/money";
import PaymentForm from "@/components/PaymentForm";
import BrandMessageForm from "@/components/BrandMessageForm";
import CopyButton from "@/components/CopyButton";
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
  const messages = await getCampaignMessages(campaign.id);

  if (campaign.status === "live") {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="rounded-3xl border border-lime/40 bg-card p-8">
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
      </div>
    );
  }

  if (campaign.status === "rejected") {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="rounded-3xl border border-fg/10 bg-card p-8">
          <h1 className="text-xl font-black text-fg">
            This campaign was rejected
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg/60">
            The admin did not approve &ldquo;{campaign.title}&rdquo;. If
            you already sent the budget, contact the admin on Discord
            about your refund.
          </p>
          <div className="mx-auto mt-5 max-w-sm">
            <DiscordButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="rounded-3xl border border-lime/40 bg-card p-6 md:p-8">
        <h1 className="text-xl font-black leading-snug text-fg">
          Thanks! To make your campaign LIVE, send your Budget in USDT to
          admin wallet and paste Transaction ID here.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg/60">
          Campaign:{" "}
          <span className="font-bold text-fg">{campaign.title}</span> —{" "}
          {campaign.brand_name}
        </p>

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
                <p className="break-all font-mono text-sm font-bold text-fg">
                  {wallet}
                </p>
                <CopyButton text={wallet} label="Copy" />
              </div>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-fg/70">
                The admin wallet address hasn&apos;t been set yet — contact
                the admin on Discord to get it.
              </p>
            )}
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
          After admin verifies payment, your campaign will go LIVE in 1-2
          hours.
        </p>
      </div>

      {/* Private chat with the admin — text messages and direct
          proof screenshot uploads, locked to this campaign. */}
      <div
        id="brand-chat"
        className="scroll-mt-6 rounded-3xl border border-fg/10 bg-card p-6 md:p-8"
      >
        <h2 className="text-lg font-black text-fg">
          Chat with the admin / Send proof
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/60">
          This conversation is private — only you and the admin can see
          it. Tell the admin you sent the budget and upload your payment
          screenshot here as proof. The admin can reply to you in this
          chat.
        </p>
        <div className="mt-5">
          <BrandMessageForm
            campaignId={campaign.id}
            initialMessages={messages}
            viewerIsAdmin={isOwner(profile)}
            brandName={campaign.brand_name}
          />
        </div>
      </div>
    </div>
  );
}
