import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";
import { platformFeeFor } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";

interface BudgetEditBody {
  campaignId?: string;
  /** The new campaign budget total in USD. */
  newBudgetTotal?: number;
  /** Why the budget changed, e.g. "Brand sent $100 top-up" or
   *  "Reduced — refunding remainder to brand". */
  reason?: string;
}

/**
 * Owner-only campaign budget edit (admin campaign cards +
 * budget edit, Turn's decision 2026-11-10): the owner can raise
 * or lower a live or pending campaign's budget from /admin.
 *
 * Rules: spent = budget_total − budget_left. The new total must
 * be > $0 and at least what is already spent (the budget can
 * never drop below money already allocated to creators). The new
 * budget_left = new total − spent. The edit is recorded in
 * campaign_budget_history (migration 0033) with the reason.
 *
 * Money never moves here: if the budget went up, the owner must
 * already have received the extra budget + 15% platform fee from
 * the brand (he verifies it himself); if it went down, he
 * refunds the remainder to the brand manually by email + USDT.
 * The site does not charge or refund anything on its own. The
 * platform fee is ALWAYS recomputed from the new total (15% of
 * it) — a budget edit that left the old fee in place would make
 * the admin card and the payment page verify/collect the wrong
 * total.
 */
export async function POST(request: Request) {
  const supabase = getServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }
  const profile = await getProfile(auth.user.id);
  if (!isOwner(profile)) {
    return NextResponse.json(
      { error: "Admin Review is owner-only." },
      { status: 403 }
    );
  }
  // Best-effort rate limit (see lib/rate-limit.ts): 10 budget
  // edits per minute per admin — an edit moves money's
  // accounting, so rapid-fire clicks are throttled.
  const rl = rateLimit(`admin-campaign-budget:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — please wait ${rl.retryAfterSeconds ?? 60} seconds and try again.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  let body: BudgetEditBody;
  try {
    body = (await request.json()) as BudgetEditBody;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }
  const reason = String(body.reason ?? "").trim();
  if (!reason) {
    return NextResponse.json(
      { error: "Write a reason for the budget change." },
      { status: 400 }
    );
  }
  if (reason.length > 200) {
    return NextResponse.json(
      { error: "Reason must be 200 characters or less." },
      { status: 400 }
    );
  }
  const newTotalRaw = Number(body.newBudgetTotal);
  if (!Number.isFinite(newTotalRaw) || newTotalRaw <= 0) {
    return NextResponse.json(
      { error: "New budget total must be more than $0." },
      { status: 400 }
    );
  }
  // Cents only — no fractions of a cent in a budget.
  const newTotal = Math.round(newTotalRaw * 100) / 100;

  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select("id, status, budget_total, budget_left")
    .eq("id", body.campaignId ?? "")
    .single();
  if (campError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found." },
      { status: 404 }
    );
  }
  const row = campaign as {
    id: string;
    status: string;
    budget_total: number;
    budget_left: number;
  };
  // A rejected campaign is gone forever — its budget means
  // nothing. Pending and live (including settling) campaigns can
  // be edited: a pending campaign's budget grows when the brand
  // tops up before launch, a live one's when the brand sends more.
  if (row.status !== "pending" && row.status !== "live") {
    return NextResponse.json(
      {
        error: `This campaign is ${row.status} and its budget can no longer be edited.`,
      },
      { status: 400 }
    );
  }

  const oldTotal = Number(row.budget_total ?? 0);
  const oldLeft = Number(row.budget_left ?? 0);
  // Spent = total − left. Guard against a negative left (an
  // over-spent campaign): spent is at least 0, at most the total.
  const spent = Math.min(Math.max(0, oldTotal - oldLeft), oldTotal);
  if (newTotal < spent) {
    return NextResponse.json(
      {
        error: `New budget cannot be below what is already spent ($${spent.toFixed(2)}).`,
      },
      { status: 400 }
    );
  }
  const newLeft = Math.round((newTotal - spent) * 100) / 100;

  // Record the edit FIRST: if the history table does not exist
  // yet (migration 0033 not applied), stop here with a clear
  // message instead of changing the budget with no audit trail.
  const { data: historyRow, error: historyError } = await supabase
    .from("campaign_budget_history")
    .insert({
      campaign_id: row.id,
      changed_by: auth.user.id,
      old_budget_total: oldTotal,
      new_budget_total: newTotal,
      old_budget_left: oldLeft,
      new_budget_left: newLeft,
      reason,
    })
    .select("id")
    .single();
  if (historyError) {
    if (/campaign_budget_history/i.test(historyError.message)) {
      return NextResponse.json(
        {
          error:
            "Budget history is not set up yet — run migration 0033 in Supabase first.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: historyError.message }, { status: 400 });
  }

  // P0-2: atomic budget-total set (migration 0036). The old code
  // computed spent from a read, then wrote budget_total /
  // budget_left absolutely — racing a concurrent approve, which
  // could then be overwritten or leave paid_out inconsistent.
  // The RPC sets the total inside the database (spent is read
  // there, under the same lock) and refuses (ok: false) when the
  // new total is below what is already spent. Never fall back to
  // the absolute write.
  const {
    data: budgetRows,
    error: budgetRpcError,
  } = await supabase.rpc("set_campaign_budget_total", {
    p_campaign_id: row.id,
    p_new_total: newTotal,
  });
  const historyId = (historyRow as { id: string } | null)?.id ?? "";
  if (budgetRpcError) {
    // Function missing = migration 0036 not applied yet. Remove
    // the history row (the edit did not happen) and say so.
    const { error: rollbackError } = await supabase
      .from("campaign_budget_history")
      .delete()
      .eq("id", historyId);
    if (rollbackError) {
      // Round-6 A6: a failed rollback is NOT a silent
      // console.error any more — the history row now records a
      // budget edit that never happened, and the overpayment
      // math reads it. Tell Turn the exact row to delete by
      // hand instead of claiming "nothing was changed".
      console.error(
        "[admin/campaign-budget] could not roll back history row after missing-0036 RPC failure:",
        rollbackError.message
      );
      return NextResponse.json(
        {
          error:
            `Budget could not be updated atomically — run migration 0036 in Supabase first, then retry. Nothing was changed, BUT the budget-history row ${historyId} could not be deleted and still records this edit as if it happened — delete it by hand in Supabase (campaign_budget_history table, id ${historyId}) or the overpayment math will read a phantom edit.`,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      {
        error:
          "Budget could not be updated atomically — run migration 0036 in Supabase first, then retry. Nothing was changed.",
      },
      { status: 500 }
    );
  }
  const budgetResult = (budgetRows as
    | { ok: boolean; new_budget_left: number; new_budget_total: number }[]
    | null)?.[0];
  if (!budgetResult?.ok) {
    // New total below spent (spent may have grown since the read
    // above). Remove the history row — the edit did not happen.
    const { error: rollbackError } = await supabase
      .from("campaign_budget_history")
      .delete()
      .eq("id", historyId);
    if (rollbackError) {
      // Round-6 A6: same phantom-row hazard as above — the
      // history row records an edit that never happened. Surface
      // the orphaned row id instead of a silent console.error.
      console.error(
        "[admin/campaign-budget] could not roll back history row after rejected budget edit:",
        rollbackError.message
      );
      return NextResponse.json(
        {
          error:
            `New budget cannot be below what is already spent ($${spent.toFixed(2)}). BUT the budget-history row ${historyId} could not be deleted and still records this edit as if it happened — delete it by hand in Supabase (campaign_budget_history table, id ${historyId}) or the overpayment math will read a phantom edit.`,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      {
        error: `New budget cannot be below what is already spent ($${spent.toFixed(2)}).`,
      },
      { status: 400 }
    );
  }
  const finalLeft = Number(budgetResult.new_budget_left ?? newLeft);
  const finalTotal = Number(budgetResult.new_budget_total ?? newTotal);

  // P2-6: the history row was inserted with new_budget_left from
  // the PRE-RPC read — correct it to the RPC's returned values.
  // A concurrent approve may have moved `spent` between the read
  // and the RPC, so the pre-RPC figure can be wrong. Best-effort:
  // the budget itself already changed correctly; a stale history
  // figure must not fail the edit.
  const { error: historyFixError } = await supabase
    .from("campaign_budget_history")
    .update({
      new_budget_total: finalTotal,
      new_budget_left: finalLeft,
    })
    .eq("id", (historyRow as { id: string } | null)?.id ?? "");
  if (historyFixError) {
    console.error(
      "[admin/campaign-budget] could not correct history row to RPC values:",
      historyFixError.message
    );
  }

  // platform_fee is recomputed from the new total (15% of it —
  // never the stale fee from the old budget). Since migration
  // 0038 the RPC above already sets it atomically with the
  // budget, so this write is a reconciliation of the same value
  // (and the only fee write on a database that has 0036 but not
  // 0038 yet). If it fails, the budget already changed — the
  // history row is KEPT (it accurately records an edit that
  // happened) and the owner is told honestly what to do: there
  // is no fee-only UI, so re-saving the same budget total
  // retries the fee update.
  const { error: feeError } = await supabase
    .from("campaigns")
    .update({ platform_fee: platformFeeFor(finalTotal) })
    .eq("id", row.id);
  if (feeError) {
    console.error(
      "[admin/campaign-budget] platform-fee update failed after budget edit:",
      feeError.message
    );
    return NextResponse.json(
      {
        error: `Budget total was updated to $${finalTotal.toFixed(2)} ($${finalLeft.toFixed(2)} left), but the 15% platform fee could not be recomputed (${feeError.message}). The edit is recorded in the budget history — re-save the same budget total to retry the fee update. The fee shown on the campaign card may be stale until then.`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `Budget updated to $${finalTotal.toFixed(2)} ($${finalLeft.toFixed(2)} left). Platform fee is now $${platformFeeFor(finalTotal).toFixed(2)} (15% of the new budget).`,
    budget_total: finalTotal,
    budget_left: finalLeft,
    platform_fee: platformFeeFor(finalTotal),
  });
}
