"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Campaign } from "@/lib/types";
import { DRIVE_FOLDER_ERROR, isDriveFolderUrl } from "@/lib/validate";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";

/**
 * Edit a PENDING campaign in place (Round-4 P1-B4): brief,
 * video requirements, rate per 1k views and Drive link. Shown on
 * the payment page while the campaign is pending, so a typo'd
 * rate or brief is fixed here instead of reject → recreate →
 * repay. Budget is NOT editable here — budget edits go through
 * the admin, who records the history the approve gate needs.
 * Only changed fields are sent; the API re-validates every field
 * with the same rules as campaign creation.
 */
export default function BrandCampaignEditForm({
  campaign,
}: {
  campaign: Campaign;
}) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState(campaign.description ?? "");
  const [requirements, setRequirements] = useState(campaign.rules ?? "");
  const [rate, setRate] = useState(String(campaign.view_bonus_per_1k));
  const [driveUrl, setDriveUrl] = useState(campaign.brief_url ?? "");
  const [busy, setBusy] = useState(false);

  const changed =
    brief.trim() !== (campaign.description ?? "").trim() ||
    requirements.trim() !== (campaign.rules ?? "").trim() ||
    rate.trim() !== String(campaign.view_bonus_per_1k) ||
    driveUrl.trim() !== (campaign.brief_url ?? "").trim();

  async function save() {
    const briefTrim = brief.trim();
    const reqTrim = requirements.trim();
    const driveTrim = driveUrl.trim();
    if (!briefTrim) {
      showError("This field is required: Campaign Brief.");
      return;
    }
    if (briefTrim.length > 5000) {
      showError("Campaign Brief must be 5,000 characters or less.");
      return;
    }
    if (!reqTrim) {
      showError("This field is required: Video requirements.");
      return;
    }
    if (reqTrim.length > 5000) {
      showError("Video requirements must be 5,000 characters or less.");
      return;
    }
    const rateNum = Number(rate);
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      showError("Error: Rate must be more than $0 per 1k views");
      return;
    }
    if (rateNum > 1000) {
      showError("Error: Rate must be $1,000 or less per 1k views.");
      return;
    }
    // Rounds-to-$0 (round-5 P2): the server rounds the rate to
    // cents and rejects anything that rounds to $0.00 — a tiny
    // rate like $0.001 passes the "> $0" check above but would
    // fail at save. Check it here, with the server's exact message.
    if (Math.round(rateNum * 100) / 100 <= 0) {
      showError(
        "Error: Rate is too small — after rounding it is $0.00 per 1k views."
      );
      return;
    }
    if (!driveTrim) {
      showError("This field is required: Google Drive Link.");
      return;
    }
    if (!isDriveFolderUrl(driveTrim)) {
      showError(`Error: ${DRIVE_FOLDER_ERROR}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: briefTrim,
          requirements: reqTrim,
          ratePer1k: rateNum,
          briefUrl: driveTrim,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the changes.");
      showSuccess("Campaign updated.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not save the changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id="edit-campaign"
      className="scroll-mt-6 rounded-3xl border border-fg/10 bg-card p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-fg">Fix campaign details</h2>
          <p className="mt-1 text-sm leading-relaxed text-fg/60">
            Your campaign is still pending — fix a typo in the brief,
            requirements, rate or Drive link here. No need to start
            over.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-fg/20 px-4 py-2 text-xs font-bold text-fg hover:border-lime hover:text-limeink"
        >
          {open ? "Close" : "Edit details"}
        </button>
      </div>
      {open && (
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-bold text-fg">
            Rate per 1,000 views (USD)
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-sm text-fg outline-none placeholder:text-fg/30 focus:border-lime"
            />
          </label>
          <label className="block text-sm font-bold text-fg">
            Campaign Brief
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              maxLength={5000}
              className="mt-1 w-full resize-y rounded-xl border border-fg/15 bg-ink px-4 py-3 text-sm leading-relaxed text-fg outline-none placeholder:text-fg/30 focus:border-lime"
            />
          </label>
          <label className="block text-sm font-bold text-fg">
            Video requirements
            <textarea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              rows={4}
              maxLength={5000}
              className="mt-1 w-full resize-y rounded-xl border border-fg/15 bg-ink px-4 py-3 text-sm leading-relaxed text-fg outline-none placeholder:text-fg/30 focus:border-lime"
            />
          </label>
          <label className="block text-sm font-bold text-fg">
            Google Drive Link (folder)
            <input
              type="url"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
              className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-3 text-sm text-fg outline-none placeholder:text-fg/30 focus:border-lime"
            />
          </label>
          <p className="text-xs leading-relaxed text-fg/50">
            The budget cannot be changed here — ask the admin in the
            chat below if the budget itself needs changing.
          </p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !changed}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-lime py-3.5 text-sm font-bold text-ink transition hover:bg-limedark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
