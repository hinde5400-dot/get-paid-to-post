"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Campaign, Platform } from "@/lib/types";
import { campaignStatus } from "@/lib/campaigns";
import { budgetUsedPct, budgetBarClass, formatUSD } from "@/lib/money";
import {
  engagementRate,
  formatEngagementRate,
  MIN_ENGAGEMENT_RATE,
} from "@/lib/engagement";
import { PLATFORM_LABELS } from "@/lib/constants";
import { BrandLogoTile } from "./CampaignBanner";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";
import type { BudgetHistoryEntry } from "@/lib/data";

/** One submitted clip on the campaign, for the card's per-post
 *  engagement breakdown. Likes + comments come from the platform
 *  refresh; shares/saves are NOT stored anywhere, so they always
 *  show "—" (never invented). */
export interface CampaignCardPost {
  id: string;
  platform: Platform;
  post_url: string;
  views: number;
  likes: number;
  comments: number;
  status: string;
}

/** Per-campaign stats, computed on the server from the live
 *  submissions table (page.tsx) — counts split by platform, total
 *  views, and the summed likes/comments for the aggregate
 *  engagement rate. */
export interface CampaignCardStats {
  total: number;
  tiktok: number;
  instagram: number;
  youtube: number;
  views: number;
  likes: number;
  comments: number;
  posts: CampaignCardPost[];
}

const EMPTY_STATS: CampaignCardStats = {
  total: 0,
  tiktok: 0,
  instagram: 0,
  youtube: 0,
  views: 0,
  likes: 0,
  comments: 0,
  posts: [],
};

/**
 * Owner-only per-campaign cards (Admin Review page, admin
 * campaign cards + budget edit batch). Every live and pending
 * campaign gets its OWN card — 10 live campaigns = 10 separate
 * cards — each with its proof (the brand chat thread), its
 * budget % used bar, its submissions split by platform, total
 * views, per-post engagement, and an owner-only budget edit.
 *
 * The public campaign card still shows budget ONLY as % used
 * (never $); this admin card shows $ figures too, because the
 * owner needs them to edit the budget — the page is owner-only.
 */
export default function AdminCampaignCards({
  campaigns,
  statsByCampaign,
  hasProof,
  hasMessages,
  budgetHistory,
}: {
  campaigns: Campaign[];
  statsByCampaign: Record<string, CampaignCardStats>;
  /** Campaign ids that have at least one real proof message. */
  hasProof: Record<string, boolean>;
  /** Campaign ids that have at least one brand message (any kind)
   *  — their button reads "Chat", not "Proof". */
  hasMessages: Record<string, boolean>;
  budgetHistory: Record<string, BudgetHistoryEntry[]>;
}) {
  if (campaigns.length === 0) {
    return (
      <div className="rounded-3xl border border-fg/10 bg-card p-6 text-center text-sm text-fg/60">
        No live or pending campaigns yet.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {campaigns.map((c) => (
        <AdminCampaignCard
          key={c.id}
          campaign={c}
          stats={statsByCampaign[c.id] ?? EMPTY_STATS}
          hasProof={Boolean(hasProof[c.id])}
          hasMessages={Boolean(hasMessages[c.id])}
          history={budgetHistory[c.id] ?? []}
        />
      ))}
    </div>
  );
}

function AdminCampaignCard({
  campaign: c,
  stats,
  hasProof,
  hasMessages,
  history,
}: {
  campaign: Campaign;
  stats: CampaignCardStats;
  hasProof: boolean;
  hasMessages: boolean;
  history: BudgetHistoryEntry[];
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(
    null
  );
  const [editOpen, setEditOpen] = useState(false);
  const [editTotal, setEditTotal] = useState("");
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [postsOpen, setPostsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Approve / Reject confirm state: approve/reject are one-tap
  // and irreversible (no un-approve; a rejected campaign never
  // shows anywhere), so both go through a confirm step first.
  // Reject also REQUIRES a reason (≤200 chars), which the brand
  // sees. The approve panel carries the underfunding checkbox
  // only when the flag below applies.
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(
    null
  );
  const [rejectReason, setRejectReason] = useState("");
  const [confirmUnderfunded, setConfirmUnderfunded] = useState(false);

  const status = campaignStatus(c);
  const isPending = c.status === "pending";
  // TxID submission time (migration 0038) — the Campaign type in
  // lib/types.ts does not declare it yet (another file's change),
  // so it is read off the mapped row here; mapCampaign in
  // lib/data.ts attaches it.
  const paymentTxSubmittedAt = (
    c as unknown as { payment_tx_submitted_at?: string | null }
  ).payment_tx_submitted_at ?? null;
  // Budget edited while a payment was on file: the TxID may
  // verify a SMALLER amount than the current budget. Exact
  // ordering still cannot be proven — the TxID submission time
  // (migration 0038) now exists, but the AMOUNT behind the TxID
  // is still unknown — so ANY budget edit on file while a TxID
  // is recorded raises the flag: the admin must confirm the
  // extra budget + 15% fee arrived before approving.
  const underfundedFlag =
    isPending && history.length > 0 && Boolean(c.payment_tx_id);
  // P2-9: the same flag on LIVE cards. A live campaign's budget
  // raise has no payment check at all (the budget-edit route
  // never asks for a TxID), so creators earn from an unfunded
  // pool until the owner verifies the top-up. Flag any budget
  // INCREASE recorded after the campaign went live — an increase
  // is a raise the brand must have paid for, and no verification
  // exists for it. Flag only, never a block on the edit itself.
  // (An increase from before go-live was already gated by the
  // approve-time confirm checkbox, so it is not flagged again.)
  const liveUnderfundedFlag =
    c.status === "live" &&
    Boolean(c.started_at) &&
    history.some(
      (h) =>
        h.new_budget_total > h.old_budget_total &&
        new Date(h.created_at).getTime() >
          new Date(String(c.started_at)).getTime()
    );
  // P1-7: a TxID on a still-pending campaign is UNVERIFIED by
  // definition (verification happens at approve time). Show how
  // long it has sat unverified — 7+ days means it has expired
  // and can no longer be approved. The clock runs from the TxID
  // submission (migration 0038); a legacy TxID row with no
  // timestamp falls back to the campaign's creation date.
  const txSubmittedMs = paymentTxSubmittedAt
    ? new Date(paymentTxSubmittedAt).getTime()
    : c.created_at
      ? new Date(c.created_at).getTime()
      : NaN;
  const txUnverifiedDays =
    isPending && c.payment_tx_id && Number.isFinite(txSubmittedMs)
      ? Math.max(0, Math.floor((Date.now() - txSubmittedMs) / 86400000))
      : null;
  const usedPct = budgetUsedPct(c.budget_total, c.budget_left);
  // Spent = total − left (same definition as the budget edit
  // API). A negative left (over-spent) counts as fully spent.
  const spent = Math.min(
    Math.max(0, c.budget_total - c.budget_left),
    c.budget_total
  );
  const aggRate = engagementRate(stats.likes, stats.comments, stats.views);
  // The 1% gate is PER CLIP — a campaign average can pass while a
  // single clip fails, so the aggregate never gets a ✓/✗. Show
  // how many clips with views are below 1% instead.
  const clipsWithViews = stats.posts.filter((p) => p.views > 0);
  const clipsBelowGate = clipsWithViews.filter((p) => {
    const r = engagementRate(p.likes, p.comments, p.views);
    return r !== null && r < MIN_ENGAGEMENT_RATE;
  }).length;
  const postsSorted = [...stats.posts].sort((a, b) => b.views - a.views);

  // Live preview of the new budget left while the owner types.
  const newTotalParsed = Number(editTotal);
  const newLeftPreview =
    Number.isFinite(newTotalParsed) && newTotalParsed > 0
      ? newTotalParsed - spent
      : null;

  async function act(
    action: "approve" | "reject",
    opts: { reason?: string; confirmUnderfunded?: boolean } = {}
  ) {
    if (action === "reject" && !(opts.reason ?? "").trim()) {
      showError("Give a reason for rejecting this campaign.");
      return;
    }
    setBusyId(c.id);
    setBusyAction(action);
    // Same 30s abort as the old pending list: a stalled mobile
    // fetch must error out with a toast, never spin forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: c.id,
          action,
          ...(opts.reason ? { reason: opts.reason.trim() } : {}),
          ...(opts.confirmUnderfunded
            ? { confirmUnderfunded: true }
            : {}),
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        // The budget was edited while a payment was on file and
        // the admin has not confirmed the extra money arrived:
        // open the approve confirm panel (with the checkbox)
        // instead of just a toast, so the decision stays in
        // front of them.
        if (
          action === "approve" &&
          (data as { underfundedRisk?: boolean }).underfundedRisk
        ) {
          setConfirming("approve");
          showError(
            (data as { error?: string }).error ||
              "Budget was changed after this payment was submitted."
          );
          return;
        }
        throw new Error(data.error || "Action failed.");
      }
      showSuccess(
        action === "approve"
          ? "Campaign approved — it is now live."
          : "Campaign rejected."
      );
      if ((data as { chatWarning?: string }).chatWarning) {
        showError((data as { chatWarning: string }).chatWarning);
      }
      setConfirming(null);
      setRejectReason("");
      setConfirmUnderfunded(false);
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        showError(
          "The request timed out — check your connection and try again."
        );
      } else {
        showError(err instanceof Error ? err.message : "Action failed.");
      }
    } finally {
      clearTimeout(timer);
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function saveBudget() {
    const newTotal = Number(editTotal);
    if (!Number.isFinite(newTotal) || newTotal <= 0) {
      showError("New budget total must be more than $0.");
      return;
    }
    if (newTotal < spent) {
      showError(
        `New budget cannot be below what is already spent (${formatUSD(spent)}).`
      );
      return;
    }
    if (!editReason.trim()) {
      showError("Write a reason for the budget change.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/campaign-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: c.id,
          newBudgetTotal: newTotal,
          reason: editReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Budget edit failed.");
      showSuccess(data.message as string);
      setEditOpen(false);
      setEditTotal("");
      setEditReason("");
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Budget edit failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-fg/10 bg-card p-5">
      {/* Header: brand + title, status, and the Proof button in
          the corner — it jumps to this campaign's brand chat
          thread (its proof) in the Brand messages section below. */}
      <div className="flex flex-wrap items-center gap-3">
        <BrandLogoTile campaign={c} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-black tracking-tight text-fg">
            {c.brand_name}
          </p>
          <p className="truncate text-sm text-fg/60">{c.title}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
            status === "live"
              ? "bg-red-500/15 text-red-300"
              : status === "settling"
                ? "bg-sky-500/15 text-sky-300"
                : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {status === "live"
            ? "Live"
            : status === "settling"
              ? "Settling — review window"
              : "Pending"}
        </span>
        <a
          href={hasProof ? `#brand-thread-${c.id}` : "#brand-messages"}
          className="shrink-0 rounded-full border border-red-400/40 px-3 py-1.5 text-xs font-black text-red-300 transition hover:bg-red-500/10"
          title={
            hasProof
              ? "Open this campaign's proof — its brand chat and payment proof"
              : hasMessages
                ? "Open this campaign's brand chat (no proof attached yet)"
                : "This campaign has no brand messages yet"
          }
        >
          {hasProof ? "Proof ↗" : hasMessages ? "Chat ↗" : "Proof — none yet"}
        </a>
      </div>

      {/* Budget % used bar (same % -only bar as the public card)
          + the $ figures the owner needs to edit the budget. */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-fg/50">Budget used</span>
          <span className="text-fg">{usedPct}% used</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-fg/10">
          <div
            className={`h-full rounded-full ${budgetBarClass(usedPct)}`}
            style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-fg/60">
          Budget {formatUSD(c.budget_total)} · Left{" "}
          {formatUSD(c.budget_left)} · Spent {formatUSD(spent)}
        </p>
        <p className="mt-1 text-xs font-semibold text-fg/60">
          Platform fee (15%): {formatUSD(c.platform_fee)} · Total to
          verify: {formatUSD(c.budget_total + c.platform_fee)} ·
          Creators pool (full budget): {formatUSD(c.budget_total)}
        </p>
      </div>

      {/* Per-campaign stats: submissions split by platform, total
          views, and aggregate engagement. Shares/saves are
          display-only and the platform refresh does not store
          them, so they always show "—" — never invented. The 1%
          gate counts likes + comments ONLY. */}
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-2xl bg-fg/5 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
            Submissions
          </p>
          <p className="mt-1 font-display text-base font-black text-fg">
            {stats.total}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-fg/50">
            TikTok {stats.tiktok} · Instagram {stats.instagram} ·
            YouTube {stats.youtube}
          </p>
        </div>
        <div className="rounded-2xl bg-fg/5 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
            Total views
          </p>
          <p className="mt-1 font-display text-base font-black text-fg">
            {stats.views.toLocaleString("en-US")}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-fg/50">
            across {stats.total} clip{stats.total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl bg-fg/5 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
            Engagement
          </p>
          <p className="mt-1 font-display text-base font-black text-fg">
            {aggRate === null ? "—" : formatEngagementRate(aggRate)}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-fg/50">
            {aggRate === null
              ? "no views yet"
              : clipsWithViews.length === 0
                ? "no clips with views yet"
                : clipsBelowGate === 0
                  ? "all clips meet the 1% minimum"
                  : `${clipsBelowGate} of ${clipsWithViews.length} clips below 1%`}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs font-semibold text-fg/50">
        Likes {stats.likes.toLocaleString("en-US")} · Comments{" "}
        {stats.comments.toLocaleString("en-US")} · Shares — · Saves —{" "}
        <span className="text-fg/40">
          (engagement counts likes + comments only)
        </span>
      </p>

      {/* Per-post engagement breakdown, collapsed by default. */}
      {stats.posts.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setPostsOpen((v) => !v)}
            className="text-xs font-black text-red-300 underline underline-offset-2 hover:text-red-200"
          >
            {postsOpen ? "Hide posts" : `Show posts (${stats.posts.length})`}
          </button>
          {postsOpen && (
            <ul className="mt-2 space-y-2">
              {postsSorted.map((p) => {
                const rate = engagementRate(p.likes, p.comments, p.views);
                return (
                  <li
                    key={p.id}
                    className="rounded-2xl bg-fg/5 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-fg">
                        {PLATFORM_LABELS[p.platform] ?? p.platform}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                          p.status === "approved"
                            ? "bg-red-500/15 text-red-300"
                            : p.status === "rejected"
                              ? "bg-fg/10 text-fg/50"
                              : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {p.status}
                      </span>
                      <a
                        href={p.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-xs font-bold text-red-300 underline"
                      >
                        Open clip ↗
                      </a>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-fg/60">
                      {p.views.toLocaleString("en-US")} views · Likes{" "}
                      {p.likes.toLocaleString("en-US")} · Comments{" "}
                      {p.comments.toLocaleString("en-US")} · Shares — ·
                      Saves — · Engagement{" "}
                      {rate === null ? "—" : formatEngagementRate(rate)}{" "}
                      {rate !== null &&
                        (rate >= MIN_ENGAGEMENT_RATE
                          ? "✓ meets 1%"
                          : "✗ below 1%")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Budget history, collapsed by default. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="text-xs font-black text-red-300 underline underline-offset-2 hover:text-red-200"
        >
          {historyOpen
            ? "Hide budget history"
            : `Budget history (${history.length})`}
        </button>
        {historyOpen && (
          <ul className="mt-2 space-y-2">
            {history.length === 0 ? (
              <li className="rounded-2xl bg-fg/5 px-4 py-3 text-xs font-semibold text-fg/50">
                No budget edits yet.
              </li>
            ) : (
              history.map((h, i) => (
                <li
                  key={`${h.created_at}-${i}`}
                  className="rounded-2xl bg-fg/5 px-4 py-3"
                >
                  <p className="text-xs font-black text-fg">
                    {formatUSD(h.old_budget_total)} →{" "}
                    {formatUSD(h.new_budget_total)} total ·{" "}
                    {formatUSD(h.new_budget_left)} left after
                  </p>
                  <p className="mt-1 text-xs font-semibold text-fg/60">
                    {h.reason}
                  </p>
                  <p className="mt-1 text-[11px] text-fg/40">
                    {new Date(h.created_at).toLocaleString("en-US")}
                  </p>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {/* Payment status — the proof the budget was sent.
          Approve only after the budget actually reached the
          owner. Shown on pending AND live cards: once live, the
          TxID is the audit trail for what was verified, not
          something to dig out of the chat thread. */}
      {(isPending || c.status === "live") && (
        <div
          className={`mt-3 rounded-xl px-4 py-3 ${
            c.payment_tx_id
              ? "border border-red-500/30 bg-red-500/10"
              : "border border-amber-400/30 bg-amber-500/10"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg/50">
            Payment status
          </p>
          {c.payment_tx_id ? (
            <>
              <p className="mt-1 text-xs font-black text-red-300">
                Payment submitted
              </p>
              <p className="mt-1 break-all font-mono text-xs font-bold text-fg/80">
                TxID: {c.payment_tx_id}
              </p>
              <a
                href={`https://tronscan.org/#/transaction/${c.payment_tx_id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs font-bold text-lime hover:underline"
              >
                Verify on Tronscan ↗
              </a>
              {txUnverifiedDays !== null && (
                <p
                  className={`mt-2 text-xs font-bold leading-relaxed ${
                    txUnverifiedDays >= 7
                      ? "text-red-300"
                      : "text-amber-300"
                  }`}
                >
                  ⚠ Payment unverified for {txUnverifiedDays}{" "}
                  day{txUnverifiedDays === 1 ? "" : "s"}
                  {txUnverifiedDays >= 7
                    ? " — this campaign has expired (payment unverified for 7+ days) and cannot be approved. Ask the brand to create a new campaign."
                    : " — verify it on Tronscan before approving."}
                </p>
              )}
              {underfundedFlag && (
                <p className="mt-2 text-xs font-bold leading-relaxed text-amber-300">
                  ⚠ This campaign&apos;s budget was edited while a
                  payment was on file — the TxID may predate the
                  edit. Verify the extra budget + 15% fee was
                  received before approving.
                </p>
              )}
              {liveUnderfundedFlag && (
                <p className="mt-2 text-xs font-bold leading-relaxed text-amber-300">
                  ⚠ This campaign&apos;s budget was raised while it
                  was live — the extra budget + 15% fee was never
                  verified. Creators are earning from the increased
                  budget; verify the top-up reached you.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mt-1 text-xs font-black text-amber-300">
                No payment yet
              </p>
              <p className="mt-1 text-xs font-semibold text-fg/60">
                The brand has not submitted a payment. Do not approve
                until the budget reaches you.
              </p>
            </>
          )}
        </div>
      )}

      {c.description && (
        <p className="mt-3 text-sm leading-relaxed text-fg/60">
          {c.description}
        </p>
      )}

      {c.brief_url && (
        <p className="mt-2 text-sm">
          <a
            href={c.brief_url}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-lime hover:underline"
          >
            Campaign brief (Google Drive) ↗
          </a>
        </p>
      )}

      {/* Actions: approve/reject for pending campaigns, budget
          edit for every card. Approve and Reject are irreversible
          (no un-approve; a rejected campaign never shows
          anywhere), so both confirm first — approve with a
          window.confirm, or the inline panel when the budget-edit
          flag applies (it needs the checkbox); reject always with
          the inline panel, because it needs a reason. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {isPending && (
          <>
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => {
                if (underfundedFlag) {
                  setConfirming("approve");
                  return;
                }
                if (
                  window.confirm(
                    "Approve this campaign? It goes live on Discover right away. This cannot be undone — there is no un-approve."
                  )
                ) {
                  void act("approve");
                }
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-500 py-2.5 text-sm font-black text-white transition hover:bg-red-600 disabled:opacity-40"
            >
              {busyId === c.id && busyAction === "approve" ? (
                <>
                  <Spinner /> Loading...
                </>
              ) : (
                "Approve — go live"
              )}
            </button>
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => setConfirming("reject")}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-red-400/40 py-2.5 text-sm font-bold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              {busyId === c.id && busyAction === "reject" ? (
                <>
                  <Spinner /> Loading...
                </>
              ) : (
                "Reject"
              )}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setEditOpen((v) => !v);
            if (!editOpen) setEditTotal(String(c.budget_total));
          }}
          className="flex flex-1 items-center justify-center rounded-full border border-fg/15 py-2.5 text-sm font-bold text-fg transition hover:bg-fg/5"
        >
          {editOpen ? "Close budget edit" : "Edit budget"}
        </button>
      </div>

      {/* Approve / Reject confirm panel. Approve is one tap away
          from live on Discover and cannot be undone; reject hides
          the campaign forever and the brand sees the reason. */}
      {confirming && (
        <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
          {confirming === "approve" ? (
            <>
              <p className="text-sm font-black text-amber-200">
                Approve this campaign — go live?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-fg/70">
                This puts the campaign live on Discover right away.
                There is no un-approve.
              </p>
              {underfundedFlag && (
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm font-bold text-amber-200">
                  <input
                    type="checkbox"
                    checked={confirmUnderfunded}
                    onChange={(e) =>
                      setConfirmUnderfunded(e.target.checked)
                    }
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#C6FF00]"
                  />
                  This campaign&apos;s budget was edited while a
                  payment was on file — I verified the extra budget +
                  15% fee was received.
                </label>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={
                    busyId === c.id ||
                    (underfundedFlag && !confirmUnderfunded)
                  }
                  onClick={() => {
                    setConfirming(null);
                    void act("approve", { confirmUnderfunded });
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-500 py-2.5 text-sm font-black text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyId === c.id && busyAction === "approve" ? (
                    <>
                      <Spinner /> Loading...
                    </>
                  ) : (
                    "Confirm approve"
                  )}
                </button>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => {
                    setConfirming(null);
                    setConfirmUnderfunded(false);
                  }}
                  className="rounded-full border border-fg/15 px-5 py-2.5 text-sm font-bold text-fg transition hover:bg-fg/5 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-black text-amber-200">
                Reject this campaign?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-fg/70">
                Rejecting hides it forever — it is never shown
                anywhere. The brand sees your reason on its dashboard
                and payment page.
              </p>
              <label className="mt-3 block text-xs font-bold text-fg/60">
                Reason (required, max 200 characters)
                <input
                  type="text"
                  value={rejectReason}
                  maxLength={200}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder='e.g. "Budget was never sent" or "Brief breaks the rules"'
                  className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-2.5 text-sm text-fg outline-none placeholder:text-fg/30 focus:border-red-500"
                />
              </label>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={
                    busyId === c.id || !rejectReason.trim()
                  }
                  onClick={() => {
                    setConfirming(null);
                    void act("reject", { reason: rejectReason.trim() });
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-500 py-2.5 text-sm font-black text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyId === c.id && busyAction === "reject" ? (
                    <>
                      <Spinner /> Loading...
                    </>
                  ) : (
                    "Confirm reject"
                  )}
                </button>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => {
                    setConfirming(null);
                    setRejectReason("");
                  }}
                  className="rounded-full border border-fg/15 px-5 py-2.5 text-sm font-bold text-fg transition hover:bg-fg/5 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Budget edit panel. Money never moves here: an increase
          only works if the brand already sent the extra budget +
          15% platform fee (the owner verifies it himself); a
          decrease is refunded by the owner manually, email + USDT. */}
      {editOpen && (
        <div className="mt-4 rounded-2xl border border-fg/10 bg-fg/5 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-fg/50">
            Edit budget
          </p>
          <p className="mt-2 text-sm font-semibold text-fg/70">
            Current total {formatUSD(c.budget_total)} · Left{" "}
            {formatUSD(c.budget_left)} · Already spent {formatUSD(spent)}
          </p>
          <label className="mt-3 block text-xs font-bold text-fg/60">
            New budget total (USD)
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={editTotal}
              onChange={(e) => setEditTotal(e.target.value)}
              placeholder={String(c.budget_total)}
              className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-2.5 text-sm text-fg outline-none placeholder:text-fg/30 focus:border-red-500"
            />
          </label>
          {newLeftPreview !== null && (
            <p
              className={`mt-2 text-xs font-bold ${
                newLeftPreview < 0 ? "text-red-400" : "text-fg/60"
              }`}
            >
              New budget left:{" "}
              {newLeftPreview < 0
                ? `cannot be below spent (${formatUSD(spent)})`
                : formatUSD(newLeftPreview)}
            </p>
          )}
          <label className="mt-3 block text-xs font-bold text-fg/60">
            Reason
            <input
              type="text"
              value={editReason}
              maxLength={200}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder='e.g. "Brand sent $100 top-up" or "Reduced — refunding remainder to brand"'
              className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-2.5 text-sm text-fg outline-none placeholder:text-fg/30 focus:border-red-500"
            />
          </label>
          <p className="mt-2 text-xs leading-relaxed text-fg/50">
            If you raised the budget, make sure the brand already
            sent the extra budget + 15% platform fee — the site
            does not charge anything on its own. If you lowered it,
            refund the remainder to the brand yourself (email + USDT).
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveBudget()}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-500 py-2.5 text-sm font-black text-white transition hover:bg-red-600 disabled:opacity-40"
            >
              {saving ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Save budget"
              )}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setEditOpen(false);
                setEditTotal("");
                setEditReason("");
              }}
              className="rounded-full border border-fg/15 px-5 py-2.5 text-sm font-bold text-fg transition hover:bg-fg/5 disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
