import { redirect } from "next/navigation";
import { getCurrentUser, getProfile, isOwner } from "@/lib/auth";
import { getAllSubmissions, getPendingCampaigns, getAllWithdrawals, getAdminUsdtWallet, getBrandMessages } from "@/lib/data";
import { getServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import AdminReviewList, { type AdminSubmission } from "@/components/AdminReviewList";
import AdminCampaignList from "@/components/AdminCampaignList";
import AdminMessagesList from "@/components/AdminMessagesList";
import AdminWithdrawalList, { type WithdrawalWithCreator } from "@/components/AdminWithdrawalList";
import AdminSettingsForm from "@/components/AdminSettingsForm";

export default async function AdminPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-fg/10 bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-fg">Admin Review</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg/60">
          Supabase is not configured yet. Add your keys to .env.local first.
        </p>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  if (!isOwner(profile)) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-fg/10 bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-fg">Access denied</h1>
        <p className="mt-3 text-sm text-fg/60">
          Admin Review is owner-only. The first account created on the site
          is the owner.
        </p>
      </div>
    );
  }

  const submissions = await getAllSubmissions();
  const pendingCampaigns = await getPendingCampaigns();
  const withdrawals = await getAllWithdrawals();
  const adminWallet = await getAdminUsdtWallet();
  const brandMessages = await getBrandMessages();

  // Creator emails for the review list (owner can read all users).
  const supabase = getServerClient();
  const emailById = new Map<string, string>();
  if (supabase) {
    const { data } = await supabase.from("users").select("id, email");
    for (const row of (data ?? []) as { id: string; email: string }[]) {
      emailById.set(row.id, row.email);
    }
  }

  const items: AdminSubmission[] = submissions.map((s) => ({
    ...s,
    creator_email: emailById.get(s.user_id) ?? s.user_id.slice(0, 8),
  }));

  const pending = items.filter((s) => s.status === "pending").length;
  const pendingWithdrawals = withdrawals.filter(
    (w) => w.status === "pending"
  ).length;
  const unreadMessages = brandMessages.filter((m) => !m.is_read).length;
  const withdrawalItems: WithdrawalWithCreator[] = withdrawals.map((w) => ({
    ...w,
    creator_email: emailById.get(w.user_id) ?? w.user_id.slice(0, 8),
  }));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Admin Review</h1>
        <p className="mt-2 text-sm text-fg/60">
          Owner-only. Submissions stay Pending at $0 until you enter verified
          views and approve them. Approved earnings go into the creator&apos;s
          72-hour hold and are released to their withdrawable balance
          automatically once the hold ends.
        </p>
        <p className="mt-2 inline-block rounded-full bg-lime/15 px-3 py-1 text-xs font-bold text-lime">
          {pending} pending · {items.length} total submissions
        </p>
      </div>

      {/* Admin settings — USDT wallet brands pay their budget to */}
      <section>
        <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
          Admin Settings
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Save your USDT (TRC20) wallet address here. Brands send their
          campaign budget to this address and paste their Transaction ID
          on the payment page. Until you save an address, the payment
          page tells brands to contact you on Discord instead.
        </p>
        <div className="mt-4">
          <AdminSettingsForm currentWallet={adminWallet} />
        </div>
      </section>

      {/* Pending campaigns — owner-only, same check as this whole page */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Pending campaigns
          </h2>
          <span className="rounded-full bg-lime/15 px-3 py-1 text-xs font-bold text-lime">
            {pendingCampaigns.length} waiting for review
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Check the Transaction ID on each campaign — it proves the
          brand sent the budget. Approve a campaign{" "}
          <strong className="text-fg">only after the brand&apos;s
          budget has actually reached you</strong> — approving marks it
          funded and live on Discover. Rejecting hides it forever; it is
          never shown anywhere.
        </p>
        <div className="mt-4">
          {pendingCampaigns.length === 0 ? (
            <div className="rounded-3xl border border-fg/10 bg-card p-6 text-center text-sm text-fg/60">
              No campaigns waiting for review.
            </div>
          ) : (
            <AdminCampaignList campaigns={pendingCampaigns} />
          )}
        </div>
      </section>

      {/* Brand messages — private two-way chat. Brands message the
          admin from the payment page and upload proof screenshots
          there; the admin replies in the thread. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Brand messages
          </h2>
          <span className="rounded-full bg-lime/15 px-3 py-1 text-xs font-bold text-lime">
            {unreadMessages} unread · {brandMessages.length} total
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Private two-way chat with brands — payment confirmations and
          proof screenshots, attached to their campaign. Reply to a
          brand right here in the thread; brands can also reach you on
          Discord. Viewing this inbox marks messages as read.
        </p>
        <div className="mt-4">
          <AdminMessagesList messages={brandMessages} />
        </div>
      </section>

      {/* Withdrawal requests — owner-only. Approve once the USDT has
          actually been sent, or reject to refund the amount. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Withdrawal requests
          </h2>
          <span className="rounded-full bg-lime/15 px-3 py-1 text-xs font-bold text-lime">
            {pendingWithdrawals} pending · {withdrawals.length} total
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Send USDT from your wallet, then mark as Paid here. Mark a
          request as paid only after the USDT has actually been sent to
          the creator&apos;s wallet. Rejecting refunds the amount to the
          creator&apos;s withdrawable balance.
        </p>
        <div className="mt-4">
          <AdminWithdrawalList withdrawals={withdrawalItems} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
          Submission review
        </h2>
        <div className="mt-4">
          <AdminReviewList submissions={items} />
        </div>
      </section>
    </div>
  );
}
