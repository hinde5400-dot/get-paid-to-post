import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser, getProfile, isOwner } from "@/lib/auth";
import type { BrandMessage, Campaign } from "@/lib/types";
import { getAllSubmissions, getAllSubmissionsUnpaged, getPendingCampaigns, getAllWithdrawals, getAdminUsdtWallet, getBrandMessages, getBrandMessagesUnpaged, getCreatorBotRejections, getCreatorFlags, getSubmissionFlags, getDiscoverCampaigns, getCampaignBudgetHistory, getSubmissionStatusCounts, getBrandMessagesCount, getUnreadBrandMessagesCount, getBotRejectionRowCount, getRejectedCampaigns, getCampaignRejectionReasons, getOpenRefundRequests, getAllUsers, getStorageUsage, getSubmissionCount, getUserIdsByEmailSearch, getVerifiedProfilesByUser, getCreatorWarningCounts, isCampaignSettling, campaignStatus } from "@/lib/data";
import { fraudStatus } from "@/lib/fraud";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { formatUSD } from "@/lib/money";
import AdminReviewList, { type AdminSubmission, type CreatorHistory } from "@/components/AdminReviewList";
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
import AdminTabs from "@/components/AdminTabs";
import AdminUsersDirectory from "@/components/AdminUsersDirectory";
import AdminNotesPanel from "@/components/AdminNotesPanel";
import { getAdminNotes, getAdminReminders } from "@/lib/admin-notes";
import MarkRefundSentButton from "@/components/MarkRefundSentButton";
import { truncateTxId } from "@/lib/validate";

export const metadata: Metadata = {
  title: "Admin Review — Get Paid To Post",
  description:
    "Owner-only admin review for Get Paid To Post: submissions, campaigns, refund requests, withdrawals and fraud watch.",
};

/** Human-readable bytes for the storage readout (P2-A9c). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { reviewPage?: string; inboxPage?: string; fraudPage?: string; userFilter?: string; tab?: string; reviewSearch?: string; reviewStatus?: string };
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
  // Non-owners do not get a rendered "Access denied" page (200)
  // — they are redirected to their dashboard (Round-5 P2). The
  // gate itself is unchanged: only the first account (the owner)
  // may open /admin.
  if (!isOwner(profile)) {
    redirect("/dashboard");
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
  // Admin tabs (Turn's final spec): the active tab comes from
  // ?tab= (Review | Campaigns | Fraud | Brand Messages |
  // Withdrawals | Creators | Recheck | My Notes); an unknown value
  // falls back to Review. Tab clicks do NOT reload — the shell only
  // syncs ?tab= via history.replaceState.
  const tab = searchParams?.tab ?? "review";
  // Review search + status filter (admin tabs): server-side, so
  // they work with pagination. Search is by creator email (the
  // identifier /admin actually shows); status is one of
  // pending / approved / rejected.
  const reviewSearch = (searchParams?.reviewSearch ?? "").trim();
  const reviewStatusRaw = searchParams?.reviewStatus ?? "all";
  const reviewStatus =
    reviewStatusRaw === "pending" ||
    reviewStatusRaw === "approved" ||
    reviewStatusRaw === "rejected"
      ? reviewStatusRaw
      : undefined;

  // Forms #26: a failed load renders an honest error state, never
  // an empty admin view. The list getters THROW on DB error.
  let submissions: Awaited<ReturnType<typeof getAllSubmissions>> = [];
  let allSubmissions: Awaited<ReturnType<typeof getAllSubmissionsUnpaged>> =
    [];
  let statusCounts = { pending: 0, approved: 0, rejected: 0, total: 0 };
  // Filtered total for the review tab's pagination (admin tabs):
  // the unfiltered statusCounts.total is wrong once a search or
  // status filter is active — the exact filtered count is
  // loaded below, inside the try.
  let reviewTotal = 0;
  let reviewUserIds: string[] | undefined;
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
    // Review search (admin tabs): resolve the email search to
    // user ids FIRST, then filter the submission query by them —
    // server-side, so search works with pagination. A search
    // that matches nobody passes a sentinel id so the query
    // returns nothing instead of everything.
    if (reviewSearch) {
      const ids = await getUserIdsByEmailSearch(reviewSearch);
      reviewUserIds =
        ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"];
    }
    submissions = await getAllSubmissions({
      limit: REVIEW_PAGE_SIZE,
      offset: (reviewPage - 1) * REVIEW_PAGE_SIZE,
      status: reviewStatus,
      userIds: reviewUserIds,
    });
    // Derived sections (Payouts / Creators / re-check) and the
    // Proof/Chat flags need EVERY row, not just the current page —
    // see allItems / hasProof below.
    allSubmissions = await getAllSubmissionsUnpaged();
    statusCounts = await getSubmissionStatusCounts();
    // Filtered total for the review pagination (admin tabs) —
    // only needed when a search or status filter is active.
    reviewTotal =
      reviewStatus || reviewUserIds
        ? await getSubmissionCount({
            status: reviewStatus,
            userIds: reviewUserIds,
          })
        : statusCounts.total;
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

  // Admin notes & reminders (migration 0051, Turn 2026-11-14):
  // owner-only, best-effort like storage — a failed load must
  // never break the admin page; the tab then shows "not set up
  // yet". Loaded outside the main try for that reason.
  let adminNotes: Awaited<ReturnType<typeof getAdminNotes>> = [];
  let adminReminders: Awaited<ReturnType<typeof getAdminReminders>> = [];
  try {
    adminNotes = await getAdminNotes();
    adminReminders = await getAdminReminders();
  } catch {
    adminNotes = [];
    adminReminders = [];
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

  // Verified (bio-code) profiles + warning counts for the
  // Creators tab (admin tabs, migrations 0046 / 0049).
  // Best-effort: a missing table returns an empty map and the
  // tab shows "not connected" / no warnings — never a broken
  // admin page.
  const verifiedByUser = await getVerifiedProfilesByUser();
  const warningCounts = await getCreatorWarningCounts();

  // Creator history for the review cards (admin tabs): live
  // approved / rejected counts from every submission, plus the
  // fraud-ladder state — the only fraud score that exists (no
  // invented 0–100 number).
  const creatorHistory: Record<string, CreatorHistory> = {};
  for (const s of allItems) {
    const h =
      creatorHistory[s.user_id] ??
      (creatorHistory[s.user_id] = {
        approved: 0,
        rejected: 0,
        botRejections: 0,
        fraudStatus: "ok",
      });
    if (s.status === "approved") h.approved += 1;
    if (s.status === "rejected") h.rejected += 1;
  }
  for (const row of botRows) {
    const h =
      creatorHistory[row.user_id] ??
      (creatorHistory[row.user_id] = {
        approved: 0,
        rejected: 0,
        botRejections: 0,
        fraudStatus: "ok",
      });
    h.botRejections = row.bot_rejections;
    h.fraudStatus = fraudStatus(
      row.bot_rejections,
      blockedById.get(row.user_id) ?? false
    );
  }
  for (const [userId, isBlocked] of blockedById) {
    if (!isBlocked) continue;
    const h =
      creatorHistory[userId] ??
      (creatorHistory[userId] = {
        approved: 0,
        rejected: 0,
        botRejections: 0,
        fraudStatus: "ok",
      });
    h.fraudStatus = "banned";
  }

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
              ? "sky"
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
      unblock_reason: flag?.unblock_reason ?? null,
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
      unblock_reason: flag?.unblock_reason ?? null,
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

  // Tab badges (admin tabs): each tab shows its pending /
  // actionable count — Review (pending submissions), Campaigns
  // (waiting for review), Fraud (creators in fraud watch),
  // Messages (unread), Withdrawals (pending), Creators (all
  // users), Recheck (clips to re-check), My Notes (open reminders).
  const tabCounts = {
    review: statusCounts.pending,
    campaigns: pendingCampaigns.length,
    fraud: fraudCreators.length,
    messages: unreadMessages,
    withdrawals: pendingWithdrawals,
    creators: allUsers.length,
    recheck: recheckItems.length,
    notes: adminReminders.filter((r) => !r.done).length,
  };

  // Note targets (My Notes tab): campaigns (live + pending +
  // rejected), brands and creators from the users directory.
  // Labels are what Turn recognises — brand + title, email.
  const noteCampaigns = [...cardCampaigns, ...rejectedCampaigns]
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
    .map((c) => ({ id: c.id, label: `${c.brand_name} — ${c.title}` }));
  const noteBrands = allUsers
    .filter((u) => u.role === "brand")
    .map((u) => ({ id: u.id, label: u.email }));
  const noteCreators = allUsers
    .filter((u) => u.role === "creator")
    .map((u) => ({ id: u.id, label: u.email }));

  // Review search/filter params the pagination links must keep
  // (admin tabs): tab=review + the active search/status, so
  // paging never drops the filter.
  const reviewExtraQuery = [
    "tab=review",
    reviewStatus ? `reviewStatus=${reviewStatus}` : "",
    reviewSearch ? `reviewSearch=${encodeURIComponent(reviewSearch)}` : "",
  ]
    .filter(Boolean)
    .join("&");

  return (
    <div className="space-y-10">
      {/* Wallet warning — brands cannot pay while the admin USDT
          wallet is unset, so pending campaigns pile up with no
          payment. Shown only when no wallet is saved. The link
          opens the Settings panel (gear in the tab bar) without
          a reload. */}
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
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("admin:tab", { detail: { settings: true } })
                )
              }
              className="font-bold text-amber-300 underline underline-offset-2 hover:text-amber-200"
            >
              Set it in Settings
            </button>{" "}
            before approving any campaign.
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
          <p className="font-display text-2xl font-black text-red-300">
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

      {/* Admin tabs (Turn's final spec, 2026-11-13 + My Notes,
          2026-11-14): ONE page, eight tabs, no reload on switch.
          Payouts live inside Withdrawals, Users inside Creators,
          the rejected-campaign refund queue inside Campaigns, and
          Settings + Storage behind the gear in the tab bar (not
          a 9th tab). */}
      <AdminTabs
        defaultTab={tab}
        settings={
          <div className="space-y-10 rounded-3xl border border-fg/10 bg-card p-5 sm:p-6">
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
          </div>
        }
        tabs={[
          {
            id: "review",
            label: "Review",
            count: tabCounts.review,
            content: (
              <section id="submission-review">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
                    Submission review
                  </h2>
                  <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
                    {pending} pending · {statusCounts.total} total
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
                  Watch the video preview, check the creator&apos;s history
                  and the payment, then Approve or Reject. Rejecting needs
                  a reason. Select several pending clips and approve them
                  all at once — clips whose posted time could not be
                  verified are skipped, never auto-approved.
                </p>
                {/* Search by creator email + status filter (admin
                    tabs): server-side via the URL, so they work
                    with pagination. */}
                <form
                  method="get"
                  action="/admin"
                  className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-fg/10 bg-card p-3"
                >
                  <input type="hidden" name="tab" value="review" />
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold text-fg">
                    <span className="shrink-0">Search creator:</span>
                    <input
                      type="search"
                      name="reviewSearch"
                      defaultValue={reviewSearch}
                      placeholder="email, e.g. creator@gmail.com"
                      className="min-w-0 flex-1 rounded-xl border border-fg/15 bg-ink px-3 py-2 text-sm font-normal text-fg outline-none placeholder:text-fg/30 focus:border-red-500"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-fg">
                    Status:
                    <select
                      name="reviewStatus"
                      defaultValue={reviewStatus ?? "all"}
                      className="rounded-xl border border-fg/15 bg-ink px-3 py-2 text-sm font-normal text-fg outline-none focus:border-red-500"
                    >
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600"
                  >
                    Search
                  </button>
                  {(reviewSearch || reviewStatus) && (
                    <a
                      href="/admin?tab=review"
                      className="rounded-full border border-fg/20 px-4 py-2 text-sm font-bold text-fg transition hover:border-red-500 hover:text-red-300"
                    >
                      Clear
                    </a>
                  )}
                </form>
                {statusCounts.total > REVIEW_PAGE_SIZE && (
                  <p className="mt-4 max-w-2xl rounded-xl bg-amber-500/10 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-200">
                    Showing page {reviewPage} of the review list — only the
                    submission review list below is paged. The Campaigns
                    stats, Payouts, Creators and Re-check sections
                    reflect ALL submissions, not just this page.
                    Page through the list to reach older submissions.
                  </p>
                )}
                <div className="mt-4">
                  <AdminReviewList
                    submissions={items}
                    botCounts={botCounts}
                    flags={submissionFlags}
                    total={reviewTotal}
                    page={reviewPage}
                    pageSize={REVIEW_PAGE_SIZE}
                    otherPage={inboxPage}
                    instagramUrls={Object.fromEntries(instagramById)}
                    creatorHistory={creatorHistory}
                    extraQuery={reviewExtraQuery}
                    searchActive={Boolean(reviewSearch || reviewStatus)}
                  />
                </div>
              </section>
            ),
          },
          {
            id: "campaigns",
            label: "Campaigns",
            count: tabCounts.campaigns,
            content: (
              <div className="space-y-10">
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
                    to the brand yourself. Pause hides a live campaign from
                    Discover and stops new submissions until you Start it again.
                  </p>
                  <div className="mt-4">
                    <AdminCampaignCards
                      campaigns={cardCampaigns}
                      statsByCampaign={statsByCampaign}
                      hasProof={hasProof}
                      hasMessages={hasMessages}
                      budgetHistory={budgetHistory}
                      refundRequestedById={Object.fromEntries(
                        openRefunds.map((r) => [r.campaign_id, true])
                      )}
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
                    Check each paid rejection and send the refund (budget
                    only — the 15% platform fee is not refundable) by USDT
                    yourself — refunds are manual, like payouts. A campaign
                    with no payment needs no refund.
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
                                      {truncateTxId(c.payment_tx_id)}
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
                            // kind (migration 0043, Round-5 P2): 'rejected'
                            // = whole budget back on a rejected campaign,
                            // 'overpayment' = the overpaid difference on a
                            // campaign whose budget was lowered after
                            // payment. Before 0043 the kind is not recorded
                            // and is derived from the campaign's status —
                            // an open request on a non-rejected campaign
                            // can only be an overpayment one.
                            const kind =
                              r.kind === "overpayment" || r.kind === "rejected"
                                ? r.kind
                                : camp?.status === "rejected"
                                  ? "rejected"
                                  : "overpayment";
                            return (
                              <li
                                key={r.id}
                                className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-card/60 px-3 py-2.5 text-sm leading-relaxed text-fg/70"
                              >
                                <div className="min-w-0">
                                  <span
                                    className={`mr-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${
                                      kind === "overpayment"
                                        ? "bg-sky-500/15 text-sky-300"
                                        : "bg-red-500/15 text-red-300"
                                    }`}
                                  >
                                    {kind === "overpayment"
                                      ? "Overpayment"
                                      : "Rejected campaign"}
                                  </span>
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
                                        TxID {truncateTxId(r.payment_tx_id)}
                                      </a>
                                    </>
                                  )}
                                </div>
                                {/* Round-5 P1: mark the request 'sent'
                                    once the USDT refund has actually been
                                    sent — without this the queue never
                                    drains. */}
                                <MarkRefundSentButton
                                  refundId={r.id}
                                  campaignTitle={camp?.title ?? r.campaign_id.slice(0, 8)}
                                  amount={r.amount}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ),
          },
          {
            id: "fraud",
            label: "Fraud",
            count: tabCounts.fraud,
            content: (
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
            ),
          },
          {
            id: "messages",
            label: "Brand Messages",
            count: tabCounts.messages,
            content: (
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
                  The chip on each thread says whether you already replied or
                  still owe the brand an answer.
                </p>
                <div className="mt-4">
                  <AdminMessagesList messages={brandMessages} total={messagesTotal} page={inboxPage} pageSize={INBOX_PAGE_SIZE} otherPage={reviewPage} />
                </div>
              </section>
            ),
          },
          {
            id: "withdrawals",
            label: "Withdrawals",
            count: tabCounts.withdrawals,
            content: (
              <div className="space-y-10">
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
                    creator&apos;s withdrawable balance. Marking Paid sends the
                    creator an in-app notification on their dashboard.
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
              </div>
            ),
          },
          {
            id: "creators",
            label: "Creators",
            count: tabCounts.creators,
            content: (
              <div className="space-y-10">
                {/* Creators — owner-only. Every creator who has submitted,
                    with clip count, total views and total earnings. Click a
                    creator to see their clips. */}
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
                    views and earnings. The chips show which accounts each
                    creator connected (bio-code verification) and how many
                    warnings they have.
                  </p>
                  <div className="mt-4">
                    <AdminCreatorsList
                      creators={creatorRows}
                      verifiedByUser={verifiedByUser}
                      warningCounts={warningCounts}
                    />
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
                  <div className="mt-4">
                    <AdminUsersDirectory
                      users={filteredUsers}
                      userFilter={userFilter}
                      verifiedByUser={verifiedByUser}
                      warningCounts={warningCounts}
                    />
                  </div>
                </section>
              </div>
            ),
          },
          {
            id: "recheck",
            label: "Recheck",
            count: tabCounts.recheck,
            content: (
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
            ),
          },
          {
            id: "notes",
            label: "My Notes",
            count: tabCounts.notes,
            content: (
              <section>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
                    My notes &amp; reminders
                  </h2>
                  <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
                    {tabCounts.notes} reminder
                    {tabCounts.notes === 1 ? "" : "s"} open
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
                  Private — only you see this tab. Your notes and
                  flags on campaigns, brands and creators, plus your
                  own reminders. None of it is shown to brands or
                  creators anywhere on the site.
                </p>
                <div className="mt-4">
                  <AdminNotesPanel
                    notes={adminNotes}
                    reminders={adminReminders}
                    campaigns={noteCampaigns}
                    brands={noteBrands}
                    creators={noteCreators}
                  />
                </div>
              </section>
            ),
          },
        ]}
      />
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
        className="mt-5 inline-block rounded-full bg-red-500 px-6 py-3 text-sm font-black text-white transition hover:bg-red-600"
      >
        Try again
      </a>
    </div>
  );
}
