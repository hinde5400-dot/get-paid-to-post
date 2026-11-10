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
  budgetHistory,
}: {
  campaigns: Campaign[];
  statsByCampaign: Record<string, CampaignCardStats>;
  /** Campaign ids that have at least one brand message (proof). */
  hasProof: Record<string, boolean>;
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
  history,
}: {
  campaign: Campaign;
  stats: CampaignCardStats;
  hasProof: boolean;
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

  const status = campaignStatus(c);
  const isPending = c.status === "pending";
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

  async function act(action: "approve" | "reject") {
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
        body: JSON.stringify({ campaignId: c.id, action }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");
      showSuccess(
        action === "approve"
          ? "Campaign approved — it is now live."
          : "Campaign rejected."
      );
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
              : "This campaign has no brand messages yet"
          }
        >
          {hasProof ? "Proof ↗" : "Proof — none yet"}
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

      {/* Payment status — the proof the budget was sent (pending
          campaigns). Approve only after the budget actually
          reached the owner. */}
      {isPending && (
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
          edit for every card. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {isPending && (
          <>
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => void act("approve")}
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
              onClick={() => void act("reject")}
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
