import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile, isOwner } from "@/lib/auth";

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
 * The site does not charge or refund anything on its own.
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

  const body = (await request.json()) as BudgetEditBody;
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

  const { error: updateError } = await supabase
    .from("campaigns")
    .update({ budget_total: newTotal, budget_left: newLeft })
    .eq("id", row.id);
  if (updateError) {
    // The budget did not change — remove the history row we just
    // wrote so the trail never records an edit that did not happen.
    await supabase
      .from("campaign_budget_history")
      .delete()
      .eq("id", (historyRow as { id: string } | null)?.id ?? "");
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: `Budget updated to $${newTotal.toFixed(2)} ($${newLeft.toFixed(2)} left).`,
    budget_total: newTotal,
    budget_left: newLeft,
  });
}
