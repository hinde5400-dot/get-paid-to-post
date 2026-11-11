import { redirect } from "next/navigation";
import { getCurrentUser, getProfile, isOwner } from "@/lib/auth";
import type { BrandMessage, Campaign } from "@/lib/types";
import { getAllSubmissions, getAllSubmissionsUnpaged, getPendingCampaigns, getAllWithdrawals, getAdminUsdtWallet, getBrandMessages, getBrandMessagesUnpaged, getCreatorBotRejections, getCreatorFlags, getSubmissionFlags, getDiscoverCampaigns, getCampaignBudgetHistory, getSubmissionStatusCounts, getBrandMessagesCount, getUnreadBrandMessagesCount, getBotRejectionRowCount, getRejectedCampaigns, getCampaignRejectionReasons, getOpenRefundRequests, getAllUsers, getStorageUsage, isCampaignSettling, campaignStatus } from "@/lib/data";
import { fraudStatus } from "@/lib/fraud";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { formatUSD } from "@/lib/money";
import AdminReviewList, { type AdminSubmission } from "@/components/AdminReviewList";
import AdminFraudList, { type FraudCreator } from "@/components/AdminFraudList";
import AdminRecheckList from "@/components/AdminRecheckList";
import AdminPayoutsList, { type PayoutRow } from "@/components/AdminPayoutsList";
import AdminCreatorsList, { type CreatorRow } from "@/components/AdminCreatorsList";
import AdminCampaignCards, {
  type CampaignCardStats,
} from "@/components/AdminCampaignCards";
import AdminMessagesList from "@/components/AdminMessagesList";
import AdminWithdrawalList, { type WithdrawalWithCreator } from "@/components/AdminWithdrawalList";
import AdminSettingsForm from "@/components/AdminSettingsForm";

/** Human-readable bytes for the storage readout (P2-A9c). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { reviewPage?: string; inboxPage?: string; fraudPage?: string; userFilter?: string };
}) {
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

  // Pagination (Brand P1-7): the review list and the inbox page
  // newest-first, 100 rows per page, with exact totals so nothing
  // vanishes silently. Page numbers come from the URL
  // (?reviewPage= / ?inboxPage=).
  const REVIEW_PAGE_SIZE = 100;
  const INBOX_PAGE_SIZE = 100;
  const FRAUD_PAGE_SIZE = 100;
  const reviewPage = Math.max(
    1,
    Number(searchParams?.reviewPage ?? 1) || 1
  );
  const inboxPage = Math.max(1, Number(searchParams?.inboxPage ?? 1) || 1);
  const fraudPage = Math.max(1, Number(searchParams?.fraudPage ?? 1) || 1);
  // Users directory filter (P2-A12): all / brand / creator /
  // admin / blocked, via ?userFilter=.
  const userFilter = searchParams?.userFilter ?? "all";

  // Forms #26: a failed load renders an honest error state, never
  // an empty admin view. The list getters THROW on DB error.
  let submissions: Awaited<ReturnType<typeof getAllSubmissions>> = [];
  let allSubmissions: Awaited<ReturnType<typeof getAllSubmissionsUnpaged>> =
    [];
  let statusCounts = { pending: 0, approved: 0, rejected: 0, total: 0 };
  let pendingCampaigns: Awaited<ReturnType<typeof getPendingCampaigns>> =
    [];
  let withdrawals: Awaited<ReturnType<typeof getAllWithdrawals>> = [];
  let adminWallet: string | null = null;
  let brandMessages: Awaited<ReturnType<typeof getBrandMessages>> = [];
  let allBrandMessages: Awaited<
    ReturnType<typeof getBrandMessagesUnpaged>
  > = [];
  let messagesTotal = 0;
  let unreadMessages = 0;
  let botRows: Awaited<ReturnType<typeof getCreatorBotRejections>> = [];
  let botRowTotal = 0;
  let creatorFlags: Awaited<ReturnType<typeof getCreatorFlags>> = {};
  let submissionFlags: Awaited<ReturnType<typeof getSubmissionFlags>> = {};
  let discoverCampaigns: Awaited<ReturnType<typeof getDiscoverCampaigns>> =
    [];
  let rejectedCampaigns: Awaited<ReturnType<typeof getRejectedCampaigns>> =
    [];
  let rejectionReasons: Awaited<
    ReturnType<typeof getCampaignRejectionReasons>
  > = {};
  let openRefunds: Awaited<ReturnType<typeof getOpenRefundRequests>> = [];
  let allUsers: Awaited<ReturnType<typeof getAllUsers>> = [];
  let loadError = false;
  try {
    submissions = await getAllSubmissions({
      limit: REVIEW_PAGE_SIZE,
      offset: (reviewPage - 1) * REVIEW_PAGE_SIZE,
    });
    // Derived sections (Payouts / Creators / re-check) and the
    // Proof/Chat flags need EVERY row, not just the current page —
    // see allItems / hasProof below.
    allSubmissions = await getAllSubmissionsUnpaged();
    statusCounts = await getSubmissionStatusCounts();
    pendingCampaigns = await getPendingCampaigns();
    withdrawals = await getAllWithdrawals();
    adminWallet = await getAdminUsdtWallet();
    brandMessages = await getBrandMessages({
      limit: INBOX_PAGE_SIZE,
      offset: (inboxPage - 1) * INBOX_PAGE_SIZE,
    });
    allBrandMessages = await getBrandMessagesUnpaged();
    messagesTotal = await getBrandMessagesCount();
    unreadMessages = await getUnreadBrandMessagesCount();
    botRows = await getCreatorBotRejections();
    botRowTotal = await getBotRejectionRowCount();
    creatorFlags = await getCreatorFlags();
    submissionFlags = await getSubmissionFlags();
    discoverCampaigns = await getDiscoverCampaigns();
    // Refund queue (P1-A2): rejected campaigns + their reasons
    // (stored only as brand-chat messages) + open refund
    // requests. Loaded here so a failed load is a load error,
    // never a silently empty refund queue.
    rejectedCampaigns = await getRejectedCampaigns();
    rejectionReasons = await getCampaignRejectionReasons(
      rejectedCampaigns.map((c) => c.id)
    );
    openRefunds = await getOpenRefundRequests();
    // Users directory (P1-A1 / P2-A12): every user, chunked to
    // exhaustion — the old inline select capped at 1,000 users.
    allUsers = await getAllUsers();
  } catch {
    loadError = true;
  }
  if (loadError) {
    return <AdminLoadError />;
  }

  // Storage usage (P2-A9c): best-effort only — a failure here
  // must never break the admin page. getStorageUsage never
  // throws; a failed bucket renders "unavailable".
  let storageUsage: Awaited<ReturnType<typeof getStorageUsage>> = [];
  try {
    storageUsage = await getStorageUsage();
  } catch {
    storageUsage = [];
  }

  // Creator emails + blocked state for the review and fraud lists
  // (owner can read all users), plus the linked Instagram profile
  // URL (users.instagram_url, pasted at onboarding) for the
  // Instagram hand-check on review cards. Built from the chunked
  // getAllUsers load above, so it stays complete past 1,000
  // users (P1-A1).
  const emailById = new Map<string, string>();
  const blockedById = new Map<string, boolean>();
  const instagramById = new Map<string, string>();
  for (const row of allUsers) {
    emailById.set(row.id, row.email);
    blockedById.set(row.id, row.is_blocked);
    if (row.instagram_url) instagramById.set(row.id, row.instagram_url);
  }

  const items: AdminSubmission[] = submissions.map((s) => ({
    ...s,
    creator_email: emailById.get(s.user_id) ?? s.user_id.slice(0, 8),
  }));

  // Derived sections (Payouts / Creators / post-end re-check) are
  // built from EVERY submission, not the current review page —
  // otherwise approved earnings past page 1 would vanish from
  // Payouts. The review list itself stays paged (items above).
  const allItems: AdminSubmission[] = allSubmissions.map((s) => ({
    ...s,
    creator_email: emailById.get(s.user_id) ?? s.user_id.slice(0, 8),
  }));

  // Headline counts come from exact count queries over the whole
  // table, not from the current review-list page — the numbers
  // stay right when the list is paged.
  const pending = statusCounts.pending;
  const approvedCount = statusCounts.approved;
  const rejectedCount = statusCounts.rejected;
  const pendingWithdrawals = withdrawals.filter(
    (w) => w.status === "pending"
  ).length;

  // Per-campaign cards (admin campaign cards + budget edit):
  // every live (including settling) and pending campaign gets its
  // own card. Pending first (they need a decision), then live,
  // then settling; newest first inside each group.
  const statusOrder = (c: Campaign) => {
    if (c.status === "pending") return 0;
    return campaignStatus(c) === "live" ? 1 : 2;
  };
  const cardCampaigns = [...discoverCampaigns, ...pendingCampaigns]
    .filter(
      (c, i, arr) => arr.findIndex((x) => x.id === c.id) === i
    )
    .sort(
      (a, b) =>
        statusOrder(a) - statusOrder(b) ||
        new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime()
    );

  // Per-campaign stats, computed live from ALL submissions
  // (Round-4 P1-A4): the old code built this from `items` (the
  // current 100-row review page), so a campaign's card showed
  // only the submissions on that page — platform splits, total
  // views and the engagement breakdown silently changed as the
  // admin flipped pages. Payouts/Creators/Re-check already used
  // allItems; Campaigns stats now do too.
  const statsByCampaign: Record<string, CampaignCardStats> = {};
  for (const s of allItems) {
    let st = statsByCampaign[s.campaign_id];
    if (!st) {
      st = {
        total: 0,
        tiktok: 0,
        instagram: 0,
        youtube: 0,
        views: 0,
        likes: 0,
        comments: 0,
        posts: [],
      };
      statsByCampaign[s.campaign_id] = st;
    }
    st.total += 1;
    if (s.platform === "tiktok") st.tiktok += 1;
    else if (s.platform === "instagram") st.instagram += 1;
    else if (s.platform === "youtube") st.youtube += 1;
    st.views += s.views ?? 0;
    st.likes += s.likes ?? 0;
    st.comments += s.comments ?? 0;
    st.posts.push({
      id: s.id,
      platform: s.platform,
      post_url: s.post_url,
      views: s.views ?? 0,
      likes: s.likes ?? 0,
      comments: s.comments ?? 0,
      status: s.status,
    });
  }

  // Which campaigns have proof — a message that IS a proof, not
  // just any message: an image/proof upload, or a message
  // containing a Transaction ID (exactly 64 hex chars, bounded —
  // the same definition as isValidTronTxId). A plain "hello" text
  // used to light up the "Proof ↗" button; now it shows "Chat".
  // Proof/Chat flags are computed from EVERY brand message, not
  // the current inbox page — otherwise a proof on an older inbox
  // page would show "Proof — none yet" for its campaign.
  function isProofMessage(m: BrandMessage): boolean {
    if (m.message_type === "image" || m.image_path || m.proof_url)
      return true;
    return /(?<![0-9a-fA-F])(?<!0x)[0-9a-fA-F]{64}(?![0-9a-fA-F])/.test(
      m.message
    );
  }
  const hasProof: Record<string, boolean> = {};
  const hasMessages: Record<string, boolean> = {};
  for (const m of allBrandMessages) {
    hasMessages[m.campaign_id] = true;
    if (isProofMessage(m)) hasProof[m.campaign_id] = true;
  }

  let budgetHistory: Awaited<ReturnType<typeof getCampaignBudgetHistory>> =
    {};
  try {
    budgetHistory = await getCampaignBudgetHistory(
      cardCampaigns.map((c) => c.id)
    );
  } catch {
    return <AdminLoadError />;
  }
  const withdrawalItems: WithdrawalWithCreator[] = withdrawals.map((w) => ({
    ...w,
    creator_email: emailById.get(w.user_id) ?? w.user_id.slice(0, 8),
  }));

  // Bot-rejection count per creator for the review cards' bot
  // signal (admin batch 2) — live from submissions, same source
  // as the fraud view below.
  const botCounts: Record<string, number> = {};
  for (const row of botRows) botCounts[row.user_id] = row.bot_rejections;

  // Payouts (admin batch 2): every approved earning + every
  // withdrawal request, as one list. Display + flag only — the
  // money flow (manual USDT payouts) does not change.
  const payoutRows: PayoutRow[] = [];
  for (const s of allItems) {
    if (s.status === "approved") {
      const holdUntil = s.hold_until ? new Date(s.hold_until) : null;
      const inHold = holdUntil !== null && holdUntil.getTime() > Date.now();
      payoutRows.push({
        key: `earning-${s.id}`,
        kind: "earning",
        submissionId: s.id,
        creator_email: s.creator_email,
        campaign_title: s.campaign_title ?? "Campaign",
        post_url: s.post_url,
        platform: s.platform,
        views: s.views ?? 0,
        amount: s.earnings ?? 0,
        status: inHold ? "Pending (72h hold)" : "Withdrawable",
        tone: inHold ? "amber" : "sky",
        hold_until: s.hold_until,
        created_at: s.created_at,
        flagged: Boolean(submissionFlags[s.id]),
        flagReason: submissionFlags[s.id]?.reason,
      });
    } else if (s.status === "rejected" && s.hold_until) {
      // Was approved, then rejected — its earnings were reversed.
      payoutRows.push({
        key: `earning-${s.id}`,
        kind: "earning",
        submissionId: s.id,
        creator_email: s.creator_email,
        campaign_title: s.campaign_title ?? "Campaign",
        post_url: s.post_url,
        platform: s.platform,
        views: s.views ?? 0,
        amount: 0,
        status: "Rejected / Returned",
        tone: "red",
        hold_until: s.hold_until,
        created_at: s.created_at,
        flagged: Boolean(submissionFlags[s.id]),
        flagReason: submissionFlags[s.id]?.reason,
      });
    }
  }
  for (const w of withdrawalItems) {
    const wStatus = w.status;
    payoutRows.push({
      key: `withdrawal-${w.id}`,
      kind: "withdrawal",
      creator_email: w.creator_email,
      campaign_title: "Withdrawal request",
      views: 0,
      amount: w.final_amount ?? w.amount,
      status:
        wStatus === "pending"
          ? "Withdrawal requested"
          : wStatus === "approved"
            ? "Approved — send USDT, then mark paid"
            : wStatus === "paid"
              ? "Paid"
              : "Rejected",
      tone:
        wStatus === "pending"
          ? "amber"
          : wStatus === "approved"
            ? "sky"
            : wStatus === "paid"
              ? "green"
              : "red",
      created_at: w.created_at,
      network: w.method,
      address: w.details,
      // P1-A3: the on-chain payout proof, so a disputed payout
      // can be answered from the Payouts list too.
      payoutTxId: w.payout_tx_id ?? null,
    });
  }
  payoutRows.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Creators (admin batch 2): every creator who has submitted,
  // with clip count, total views and total earnings (approved
  // earnings only — rejected clips pay $0).
  const creatorMap = new Map<string, CreatorRow>();
  for (const s of allItems) {
    let row = creatorMap.get(s.user_id);
    if (!row) {
      row = {
        user_id: s.user_id,
        email: s.creator_email,
        clips: 0,
        views: 0,
        earnings: 0,
        clipList: [],
      };
      creatorMap.set(s.user_id, row);
    }
    row.clips += 1;
    row.views += s.views ?? 0;
    if (s.status === "approved") row.earnings += s.earnings ?? 0;
    row.clipList.push({
      id: s.id,
      campaign_title: s.campaign_title ?? "Campaign",
      platform: s.platform,
      post_url: s.post_url,
      views: s.views ?? 0,
      earnings: s.earnings ?? 0,
      status: s.status,
    });
  }
  const creatorRows = [...creatorMap.values()].sort(
    (a, b) => b.views - a.views || b.clips - a.clips
  );

  // P1-c fraud watch: live bot-rejection counts from submissions,
  // flag state (flagged/banned dates) from creator_flags.
  const fraudCreators: FraudCreator[] = botRows.map((row) => {
    const isBlocked = blockedById.get(row.user_id) ?? false;
    const flag = creatorFlags[row.user_id];
    return {
      user_id: row.user_id,
      email: emailById.get(row.user_id) ?? row.user_id.slice(0, 8),
      bot_rejections: row.bot_rejections,
      status: fraudStatus(row.bot_rejections, isBlocked),
      is_blocked: isBlocked,
      flagged_at: flag?.flagged_at ?? null,
      banned_at: flag?.banned_at ?? null,
      unblocked_at: flag?.unblocked_at ?? null,
      latest: row.latest,
    };
  });

  // Banned creators with no bot-view rejections (blocked manually
  // from the submission review list) never appear in botRows, but
  // they are banned — they belong in the fraud view's Banned
  // section too, with an Unblock path. fraudStatus(0, true) is
  // "banned".
  const fraudUserIds = new Set(botRows.map((row) => row.user_id));
  for (const [userId, isBlocked] of blockedById) {
    if (!isBlocked || fraudUserIds.has(userId)) continue;
    const flag = creatorFlags[userId];
    fraudCreators.push({
      user_id: userId,
      email: emailById.get(userId) ?? userId.slice(0, 8),
      bot_rejections: 0,
      status: fraudStatus(0, true),
      is_blocked: true,
      flagged_at: flag?.flagged_at ?? null,
      banned_at: flag?.banned_at ?? null,
      unblocked_at: flag?.unblocked_at ?? null,
      latest: null,
    });
  }

  // Fraud paging (round-3 P2-21): the loader returns every fraud
  // creator (it must see all rows to count them), so the page
  // slices to the current creator page here — 100 per page, like
  // review/inbox. The total is the full creator count, including
  // manually blocked creators with no bot rejections.
  const fraudPageCreators = fraudCreators.slice(
    (fraudPage - 1) * FRAUD_PAGE_SIZE,
    fraudPage * FRAUD_PAGE_SIZE
  );

  // P1-c post-end re-check queue: APPROVED submissions on campaigns
  // in their settlement window (ended, not yet auto-deleted).
  const settlingIds = new Set(
    discoverCampaigns
      .filter((c) => isCampaignSettling(c))
      .map((c) => c.id)
  );
  const recheckItems = allItems.filter(
    (s) => settlingIds.has(s.campaign_id) && s.status === "approved"
  );

  // Users directory (P2-A12): every user, with a simple filter.
  // A brand that signed up but never created a campaign, and a
  // creator who signed up but never submitted, are invisible
  // everywhere else on /admin — this is the only place they show.
  const filteredUsers = allUsers.filter((u) => {
    if (userFilter === "brand") return u.role === "brand";
    if (userFilter === "creator") return u.role === "creator";
    if (userFilter === "admin") return u.is_admin;
    if (userFilter === "blocked") return u.is_blocked;
    return true;
  });

  // Campaign lookup for the refund queue (P1-A2): refund
  // requests reference campaigns by id.
  const campaignById = new Map<string, Campaign>();
  for (const c of [...cardCampaigns, ...rejectedCampaigns]) {
    if (!campaignById.has(c.id)) campaignById.set(c.id, c);
  }

  return (
    <div className="space-y-10">
      {/* Wallet warning — brands cannot pay while the admin USDT
          wallet is unset, so pending campaigns pile up with no
          payment. Shown only when no wallet is saved. */}
      {!adminWallet && (
        <div
          role="alert"
          className="rounded-3xl border border-amber-400/40 bg-amber-500/10 p-5"
        >
          <p className="font-display text-base font-black uppercase tracking-tight text-amber-300">
            Admin USDT wallet not set — brands cannot pay.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-fg/70">
            No USDT wallet is saved, so brands have nowhere to send
            their campaign budget.{" "}
            <a
              href="#admin-settings"
              className="font-bold text-amber-300 underline underline-offset-2 hover:text-amber-200"
            >
              Set it in Settings
            </a>{" "}
            below before approving any campaign.
          </p>
        </div>
      )}

      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Admin Review</h1>
        <p className="mt-2 text-sm text-fg/60">
          Owner-only. Submissions stay Pending at $0 until you enter verified
          views and approve them. Approved earnings go into the creator&apos;s
          72-hour hold and are released to their withdrawable balance
          automatically once the hold ends.
        </p>
        <p className="mt-2 inline-block rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
          {pending} pending · {statusCounts.total} total submissions
        </p>
      </div>

      {/* Status summary — one box per count, at the top, so the
          state of the whole site reads at a glance. Payment
          pending = withdrawal requests not yet marked paid. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-3xl border border-fg/10 bg-card p-4">
          <p className="font-display text-2xl font-black text-amber-300">
            {pending}
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-fg/50">
            Pending submissions
          </p>
        </div>
        <div className="rounded-3xl border border-fg/10 bg-card p-4">
          <p className="font-display text-2xl font-black text-green-300">
            {approvedCount}
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-fg/50">
            Approved submissions
          </p>
        </div>
        <div className="rounded-3xl border border-fg/10 bg-card p-4">
          <p className="font-display text-2xl font-black text-red-300">
            {rejectedCount}
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-fg/50">
            Rejected submissions
          </p>
        </div>
        <div className="rounded-3xl border border-fg/10 bg-card p-4">
          <p className="font-display text-2xl font-black text-amber-300">
            {pendingWithdrawals}
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-fg/50">
            Payment pending
          </p>
        </div>
      </div>

      {/* Admin settings — USDT wallet brands pay their budget to */}
      <section id="admin-settings">
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

      {/* Storage (Round-4 P2-A9c): best-effort per-bucket file
          count + size. The free Supabase tier caps storage at
          1 GB — the first sign used to be uploads failing. A
          failed listing renders "unavailable", never a fake
          number, and a capped scan says so. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Storage
          </h2>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Image + proof files stored in Supabase (1 GB free tier).
          Campaign logos/thumbnails live in campaign-images, brand
          payment proofs in brand-proofs.
        </p>
        <div className="mt-4 space-y-2">
          {storageUsage.length === 0 ? (
            <p className="rounded-2xl border border-fg/10 bg-card p-5 text-sm text-fg/60">
              Storage usage unavailable.
            </p>
          ) : (
            storageUsage.map((u) => (
              <p
                key={u.bucket}
                className="rounded-2xl border border-fg/10 bg-card px-4 py-3 text-sm text-fg/70"
              >
                <span className="font-mono font-bold text-fg">
                  {u.bucket}
                </span>
                {" — "}
                {u.error ? (
                  "unavailable"
                ) : (
                  <>
                    {u.files} file{u.files === 1 ? "" : "s"} ·{" "}
                    {formatBytes(u.bytes)} of the 1 GB free tier
                    {u.capped
                      ? " (scan capped at 500 files — totals may be higher)"
                      : ""}
                  </>
                )}
              </p>
            ))
          )}
        </div>
      </section>

      {/* Campaigns — owner-only. Every live and pending campaign
          gets its OWN card: name, brand, status, budget % used,
          a Proof button in the corner (its brand chat + payment
          proof), submissions split by platform, total views and
          per-post engagement. Pending cards carry Approve /
          Reject; every card carries an Edit budget option. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Campaigns
          </h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
            {cardCampaigns.length} campaign
            {cardCampaigns.length === 1 ? "" : "s"} ·{" "}
            {pendingCampaigns.length} waiting for review
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Check the Transaction ID on each pending campaign — it proves
          the brand sent the budget. Approve a campaign{" "}
          <strong className="text-fg">only after the brand&apos;s
          budget has actually reached you</strong> — approving marks it
          funded and live on Discover. Rejecting hides it forever; it is
          never shown anywhere. Use Edit budget when a brand tops up
          (check the extra budget + 15% fee arrived first) or when a
          campaign under-uses its budget and you refund the remainder
          to the brand yourself.
        </p>
        <div className="mt-4">
          <AdminCampaignCards
            campaigns={cardCampaigns}
            statsByCampaign={statsByCampaign}
            hasProof={hasProof}
            hasMessages={hasMessages}
            budgetHistory={budgetHistory}
          />
        </div>
      </section>

      {/* Rejected campaigns — the refund queue (Round-4 P1-A2).
          A rejected campaign used to appear in NO admin section:
          the brand saw a rejection the admin could no longer
          find, and a brand that paid and then got rejected had no
          admin-visible record to trigger the manual USDT refund.
          Paid-or-not is payment_tx_id present; the reason is read
          back from the brand-chat message. Open refund requests
          (migration 0041) are listed below the campaigns. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Rejected campaigns — refund queue
          </h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
            {rejectedCampaigns.length} rejected · {openRefunds.length}{" "}
            refund{openRefunds.length === 1 ? "" : "s"} requested
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Check each paid rejection and send the refund (budget +
          fee, as decided) by USDT yourself — refunds are manual,
          like payouts. A campaign with no payment needs no refund.
        </p>
        <div className="mt-4 space-y-3">
          {rejectedCampaigns.length === 0 && openRefunds.length === 0 && (
            <p className="rounded-2xl border border-fg/10 bg-card p-5 text-sm text-fg/60">
              No rejected campaigns and no refund requests.
            </p>
          )}
          {rejectedCampaigns.map((c) => {
            const paid = Boolean(
              (c.payment_tx_id ?? "").trim()
            );
            const reason =
              rejectionReasons[c.id] ?? "No reason recorded in chat.";
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-fg/10 bg-card p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-fg">{c.title}</p>
                    <p className="mt-1 text-sm text-fg/60">
                      {c.brand_name} ·{" "}
                      {emailById.get(c.user_id ?? "") ?? "unknown brand"}{" "}
                      · Budget {formatUSD(c.budget_total)} ·{" "}
                      {new Date(c.created_at ?? "").toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="mt-1 text-sm text-fg/70">
                      Reason: {reason}
                    </p>
                    <p className="mt-1 break-all text-xs text-fg/50">
                      {paid && c.payment_tx_id ? (
                        <>
                          Paid — TxID:{" "}
                          <a
                            href={`https://tronscan.org/#/transaction/${c.payment_tx_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono font-bold text-fg underline"
                          >
                            {c.payment_tx_id}
                          </a>
                        </>
                      ) : (
                        "Not paid — nothing to refund."
                      )}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${paid ? "bg-amber-500/15 text-amber-300" : "bg-fg/10 text-fg/60"}`}
                  >
                    {paid ? "Paid — refund owed" : "Not paid"}
                  </span>
                </div>
              </div>
            );
          })}
          {openRefunds.length > 0 && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 sm:p-5">
              <p className="font-bold text-fg">
                Open refund requests ({openRefunds.length})
              </p>
              <ul className="mt-2 space-y-2">
                {openRefunds.map((r) => {
                  const camp = campaignById.get(r.campaign_id);
                  return (
                    <li
                      key={r.id}
                      className="text-sm leading-relaxed text-fg/70"
                    >
                      <span className="font-bold text-fg">
                        {camp?.title ?? r.campaign_id.slice(0, 8)}
                      </span>{" "}
                      — {formatUSD(r.amount)} requested by{" "}
                      {emailById.get(r.user_id) ?? r.user_id.slice(0, 8)}{" "}
                      on{" "}
                      {new Date(r.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                      {r.payment_tx_id && (
                        <>
                          {" · "}
                          <a
                            href={`https://tronscan.org/#/transaction/${r.payment_tx_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs font-bold text-fg underline"
                          >
                            TxID
                          </a>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Brand messages — private two-way chat. Brands message the
          admin from the payment page and upload proof screenshots
          there; the admin replies in the thread. */}
      <section id="brand-messages">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Brand messages
          </h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
            {unreadMessages} unread · {messagesTotal} total
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Private two-way chat with brands — payment confirmations and
          proof screenshots, attached to their campaign. Reply to a
          brand right here in the thread; brands can also reach you on
          Discord. Open a thread to read it — opening a thread marks its messages as read.
        </p>
        <div className="mt-4">
          <AdminMessagesList messages={brandMessages} total={messagesTotal} page={inboxPage} pageSize={INBOX_PAGE_SIZE} otherPage={reviewPage} />
        </div>
      </section>

      {/* Withdrawal requests — owner-only. Approve once the USDT has
          actually been sent, or reject to refund the amount. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Withdrawal requests
          </h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
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

      {/* Payouts — owner-only. Every approved earning (72h hold /
          withdrawable / returned) plus every withdrawal request, in
          one list, with a Flag payout action per earning row.
          Display + flag only; payouts stay manual USDT. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Payouts
          </h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
            {payoutRows.length} payout{payoutRows.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Every approved earning — in its 72-hour hold, withdrawable,
          or returned after a rejection — plus every withdrawal
          request. Flag a payout to pause it while you check it; a
          flagged payout is not a rejection. Money still moves only
          by hand: send the USDT, then mark Paid in Withdrawal
          requests above.
        </p>
        <div className="mt-4">
          <AdminPayoutsList rows={payoutRows} />
        </div>
      </section>

      {/* Creators — owner-only. Every creator who has submitted,
          with clip count, total views and total earnings. Click a
          creator to see their clips. Display-only. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Creators
          </h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
            {creatorRows.length} creator{creatorRows.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Creators who have submitted a clip, sorted by total views.
          Click a creator to see every clip they submitted, with its
          views and earnings.
        </p>
        <div className="mt-4">
          <AdminCreatorsList creators={creatorRows} />
        </div>
      </section>

      {/* Users — owner-only directory (Round-4 P2-A12). Brands and
          creators who signed up but never created a campaign or
          submitted a clip are invisible everywhere else on /admin;
          this is the only place they show. Filtered by role, admin
          status, or blocked state. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Users
          </h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
            {allUsers.length} user{allUsers.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Everyone who signed up — brands, creators, and admins —
          whether or not they have done anything yet.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["brand", "Brands"],
              ["creator", "Creators"],
              ["admin", "Admins"],
              ["blocked", "Blocked"],
            ] as const
          ).map(([value, label]) => (
            <a
              key={value}
              href={`/admin?userFilter=${value}`}
              className={`rounded-full px-4 py-2 text-xs font-black transition ${
                userFilter === value
                  ? "bg-red-500 text-black"
                  : "border border-fg/20 text-fg hover:border-fg/40"
              }`}
            >
              {label}
            </a>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {filteredUsers.length === 0 ? (
            <p className="rounded-2xl border border-fg/10 bg-card p-5 text-sm text-fg/60">
              No users match this filter.
            </p>
          ) : (
            filteredUsers.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-fg/10 bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-fg">{u.email}</p>
                  <p className="mt-0.5 text-xs text-fg/50">
                    Signed up{" "}
                    {new Date(u.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <span className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-fg/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-fg/70">
                    {u.role}
                  </span>
                  {u.is_admin && (
                    <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-red-300">
                      Admin
                    </span>
                  )}
                  {u.is_blocked && (
                    <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-red-300">
                      Blocked
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Fraud watch — owner-only. Bot-view rejections counted live
          per creator across all campaigns: 6 = concern, 10 = flag,
          one more bot rejection after the flag = auto-ban (11).
          Creators never see bot counts or flags. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Fraud watch
          </h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
            {fraudCreators.length} creator
            {fraudCreators.length === 1 ? "" : "s"} in fraud watch ·{" "}
            {botRowTotal} bot rejection{botRowTotal === 1 ? "" : "s"} counted
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Creators with bot-view rejections. 6 rejections is a concern —
          watch their next submissions. 10 is a flag, and one more bot
          rejection after the flag bans them automatically. You also get
          a Discord alert at 6, 10, and when an auto-ban happens.
          Botting means a permanent ban — if you think a flag was
          wrong, appeal through Discord support (Terms §8).
        </p>
        <div className="mt-4">
          <AdminFraudList
            creators={fraudPageCreators}
            total={fraudCreators.length}
            page={fraudPage}
            pageSize={FRAUD_PAGE_SIZE}
            reviewPage={reviewPage}
            inboxPage={inboxPage}
          />
        </div>
      </section>

      <section id="submission-review">
        <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
          Submission review
        </h2>
        {statusCounts.total > REVIEW_PAGE_SIZE && (
          <p className="mt-2 max-w-2xl rounded-xl bg-amber-500/10 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-200">
            Showing page {reviewPage} of the review list — only the
            submission review list below is paged. The Campaigns
            stats, Payouts, Creators and Re-check sections above
            and below reflect ALL submissions, not just this page.
            Page through the list to reach older submissions.
          </p>
        )}
        <div className="mt-4">
          <AdminReviewList
            submissions={items}
            botCounts={botCounts}
            flags={submissionFlags}
            total={statusCounts.total}
            page={reviewPage}
            pageSize={REVIEW_PAGE_SIZE}
            otherPage={inboxPage}
            instagramUrls={Object.fromEntries(instagramById)}
          />
        </div>
      </section>

      {/* Post-end re-check — owner-only. Approved clips on campaigns
          in their settlement window: re-check suspicious videos
          after the campaign ends. Real ones stay; a suspicious one
          is rejected even after the end (its earnings reverse). */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Post-end re-check
          </h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
            {recheckItems.length} approved clip
            {recheckItems.length === 1 ? "" : "s"} to re-check
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Approved clips on campaigns that have ended but are still in
          their settlement window. Check suspicious videos again — bot
          views often only show up after the fact. A real video stays
          approved; a suspicious one can still be rejected here, and
          rejecting it reverses its earnings and restores the campaign
          budget.
        </p>
        <div className="mt-4">
          {recheckItems.length === 0 ? (
            <div className="rounded-3xl border border-fg/10 bg-card p-6 text-center text-sm text-fg/60">
              No ended campaigns with approved clips to re-check.
            </div>
          ) : (
            <AdminRecheckList submissions={recheckItems} />
          )}
        </div>
      </section>
    </div>
  );
}

/** Honest load-failure state for /admin (Forms #26): a failed
 *  data load is a loading problem, never an empty admin view. */
function AdminLoadError() {
  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-red-500/40 bg-card p-8 text-center">
      <h1 className="font-display text-2xl font-black uppercase tracking-tight text-fg">
        Admin Review
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-fg/60">
        Couldn&apos;t load the admin page — please try again. Your
        data is safe; this is a loading problem, not an empty admin
        view.
      </p>
      <a
        href="/admin"
        className="mt-5 inline-block rounded-full bg-lime px-6 py-3 text-sm font-black text-black transition hover:bg-limedark"
      >
        Try again
      </a>
    </div>
  );
}
