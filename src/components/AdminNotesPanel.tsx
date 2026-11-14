"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import Spinner from "@/components/Spinner";
import type {
  AdminFlag,
  AdminNote,
  AdminNoteTarget,
  AdminReminder,
} from "@/lib/admin-notes";

export interface NoteTargetOption {
  id: string;
  label: string;
}

const FLAG_LABELS: Record<AdminFlag, string> = {
  watch: "👀 Watch",
  trusted: "✓ Trusted",
  risky: "⚠ Risky",
  vip: "★ VIP",
};

const FLAG_CLS: Record<AdminFlag, string> = {
  watch: "bg-sky-500/15 text-sky-300",
  trusted: "bg-lime/15 text-limeink",
  risky: "bg-amber-500/15 text-amber-300",
  vip: "bg-purple-500/15 text-purple-300",
};

/**
 * Admin-only notes, flags & reminders (migration 0051).
 *
 * ONLY the owner sees this panel — it lives in the My Notes tab
 * on /admin, and the tables behind it are RLS-restricted to the
 * admin. A note is attached to one campaign, brand or creator;
 * a flag marks that target (Watch / Trusted / Risky / VIP).
 * Reminders are Turn's own to-dos with an optional due date.
 * Nothing here is shown to brands or creators anywhere.
 */
export default function AdminNotesPanel({
  notes,
  reminders,
  campaigns,
  brands,
  creators,
}: {
  notes: AdminNote[];
  reminders: AdminReminder[];
  campaigns: NoteTargetOption[];
  brands: NoteTargetOption[];
  creators: NoteTargetOption[];
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [targetType, setTargetType] = useState<AdminNoteTarget>("campaign");
  const [targetId, setTargetId] = useState("");
  const [flag, setFlag] = useState<"" | AdminFlag>("");
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderBody, setReminderBody] = useState("");
  const [reminderDue, setReminderDue] = useState("");
  const [savingReminder, setSavingReminder] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingReminderId, setDeletingReminderId] = useState<
    string | null
  >(null);

  const options =
    targetType === "campaign"
      ? campaigns
      : targetType === "brand"
        ? brands
        : creators;

  const labelByTarget = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of campaigns) map.set(`campaign:${c.id}`, c.label);
    for (const b of brands) map.set(`brand:${b.id}`, b.label);
    for (const c of creators) map.set(`creator:${c.id}`, c.label);
    return map;
  }, [campaigns, brands, creators]);

  const typeLabel = (t: AdminNoteTarget) =>
    t === "campaign" ? "Campaign" : t === "brand" ? "Brand" : "Creator";

  const today = new Date().toISOString().slice(0, 10);
  const openReminders = reminders.filter((r) => !r.done);

  async function saveNote() {
    if (savingNote) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/admin/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          note: noteText,
          flag: flag || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save the note.");
      showSuccess("Note saved — only you can see it.");
      setNoteText("");
      setFlag("");
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not save the note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(id: string) {
    if (deletingNoteId) return;
    if (!window.confirm("Delete this note? It cannot be recovered.")) return;
    setDeletingNoteId(id);
    try {
      const res = await fetch("/api/admin/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not delete the note.");
      showSuccess("Note deleted.");
      router.refresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not delete the note.");
    } finally {
      setDeletingNoteId(null);
    }
  }

  async function saveReminder() {
    if (savingReminder) return;
    setSavingReminder(true);
    try {
      const res = await fetch("/api/admin/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: reminderTitle,
          body: reminderBody,
          dueDate: reminderDue || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok)
        throw new Error(data.error || "Could not save the reminder.");
      showSuccess("Reminder added.");
      setReminderTitle("");
      setReminderBody("");
      setReminderDue("");
      router.refresh();
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Could not save the reminder."
      );
    } finally {
      setSavingReminder(false);
    }
  }

  async function toggleReminder(id: string, done: boolean) {
    if (togglingId) return;
    setTogglingId(id);
    try {
      const res = await fetch("/api/admin/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, done }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok)
        throw new Error(data.error || "Could not update the reminder.");
      router.refresh();
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Could not update the reminder."
      );
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteReminder(id: string) {
    if (deletingReminderId) return;
    if (!window.confirm("Delete this reminder?")) return;
    setDeletingReminderId(id);
    try {
      const res = await fetch("/api/admin/reminders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok)
        throw new Error(data.error || "Could not delete the reminder.");
      showSuccess("Reminder deleted.");
      router.refresh();
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Could not delete the reminder."
      );
    } finally {
      setDeletingReminderId(null);
    }
  }

  return (
    <div className="space-y-10">
      {/* Reminders — Turn's own to-dos. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            My reminders
          </h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
            {openReminders.length} open
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Your own to-dos — follow up with a brand, check a payment,
          anything. Only you see this; brands and creators never do.
        </p>
        <div className="mt-4 rounded-2xl border border-fg/10 bg-card p-4 sm:p-5">
          <label className="block text-xs font-bold text-fg/60">
            What to remember *
            <input
              type="text"
              value={reminderTitle}
              maxLength={200}
              onChange={(e) => setReminderTitle(e.target.value)}
              placeholder='e.g. "Follow up with Boxabl if no reply"'
              className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-2.5 text-sm font-normal text-fg outline-none placeholder:text-fg/30 focus:border-red-500"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="min-w-0 flex-1 text-xs font-bold text-fg/60">
              Details (optional)
              <input
                type="text"
                value={reminderBody}
                maxLength={500}
                onChange={(e) => setReminderBody(e.target.value)}
                placeholder="Any extra detail"
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-4 py-2.5 text-sm font-normal text-fg outline-none placeholder:text-fg/30 focus:border-red-500"
              />
            </label>
            <label className="text-xs font-bold text-fg/60">
              Due date (optional)
              <input
                type="date"
                value={reminderDue}
                onChange={(e) => setReminderDue(e.target.value)}
                className="mt-1 rounded-xl border border-fg/15 bg-ink px-4 py-2.5 text-sm font-normal text-fg outline-none focus:border-red-500"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={savingReminder || !reminderTitle.trim()}
            onClick={() => void saveReminder()}
            className="mt-4 flex items-center justify-center gap-2 rounded-full bg-red-500 px-6 py-2.5 text-sm font-black text-white transition hover:bg-red-600 disabled:opacity-40"
          >
            {savingReminder ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Add reminder"
            )}
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {reminders.length === 0 && (
            <li className="rounded-2xl border border-fg/10 bg-card p-5 text-sm text-fg/60">
              No reminders yet — add one above.
            </li>
          )}
          {reminders.map((r) => {
            const overdue =
              !r.done && r.due_date !== null && r.due_date < today;
            return (
              <li
                key={r.id}
                className={`flex flex-wrap items-start gap-3 rounded-2xl border p-4 ${
                  r.done
                    ? "border-fg/10 bg-card opacity-60"
                    : overdue
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-fg/10 bg-card"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-2.5 text-sm font-bold text-fg">
                  <input
                    type="checkbox"
                    checked={r.done}
                    disabled={togglingId === r.id}
                    onChange={(e) =>
                      void toggleReminder(r.id, e.target.checked)
                    }
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#C6FF00]"
                    aria-label={r.done ? "Mark as not done" : "Mark as done"}
                  />
                  <span className={r.done ? "line-through" : undefined}>
                    {r.title}
                  </span>
                </label>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {r.due_date && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-black ${
                        overdue
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-fg/10 text-fg/60"
                      }`}
                    >
                      {overdue ? "Overdue · " : ""}
                      {new Date(`${r.due_date}T00:00:00`).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" }
                      )}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={deletingReminderId === r.id}
                    onClick={() => void deleteReminder(r.id)}
                    className="rounded-full border border-fg/15 px-3 py-1.5 text-xs font-bold text-fg/70 transition hover:border-red-400/60 hover:text-red-300 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </span>
                {r.body && (
                  <p className="w-full text-sm leading-relaxed text-fg/60">
                    {r.body}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Notes & flags — per campaign / brand / creator. */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-fg">
            Notes &amp; private flags
          </h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
            {notes.length} note{notes.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Write what only you should know about a campaign, a brand
          or a creator — why you trust them, what to watch, what you
          promised them. A flag marks the target so you spot it at a
          glance. Brands and creators never see any of this.
        </p>
        <div className="mt-4 rounded-2xl border border-fg/10 bg-card p-4 sm:p-5">
          <div className="flex flex-wrap gap-3">
            <label className="text-xs font-bold text-fg/60">
              About
              <select
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value as AdminNoteTarget);
                  setTargetId("");
                }}
                className="mt-1 rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-sm font-normal text-fg outline-none focus:border-red-500"
              >
                <option value="campaign">Campaign</option>
                <option value="brand">Brand</option>
                <option value="creator">Creator</option>
              </select>
            </label>
            <label className="min-w-0 flex-1 text-xs font-bold text-fg/60">
              {typeLabel(targetType)}
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-sm font-normal text-fg outline-none focus:border-red-500"
              >
                <option value="">Pick one…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-fg/60">
              Private flag
              <select
                value={flag}
                onChange={(e) =>
                  setFlag(e.target.value as "" | AdminFlag)
                }
                className="mt-1 rounded-xl border border-fg/15 bg-ink px-3 py-2.5 text-sm font-normal text-fg outline-none focus:border-red-500"
              >
                <option value="">No flag</option>
                <option value="watch">👀 Watch</option>
                <option value="trusted">✓ Trusted</option>
                <option value="risky">⚠ Risky</option>
                <option value="vip">★ VIP</option>
              </select>
            </label>
          </div>
          <label className="mt-3 block text-xs font-bold text-fg/60">
            Note *
            <textarea
              value={noteText}
              maxLength={2000}
              rows={3}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Only you will ever read this."
              className="mt-1 w-full resize-y rounded-xl border border-fg/15 bg-ink px-4 py-2.5 text-sm font-normal leading-relaxed text-fg outline-none placeholder:text-fg/30 focus:border-red-500"
            />
          </label>
          <button
            type="button"
            disabled={savingNote || !targetId || !noteText.trim()}
            onClick={() => void saveNote()}
            className="mt-4 flex items-center justify-center gap-2 rounded-full bg-red-500 px-6 py-2.5 text-sm font-black text-white transition hover:bg-red-600 disabled:opacity-40"
          >
            {savingNote ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save note"
            )}
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {notes.length === 0 && (
            <li className="rounded-2xl border border-fg/10 bg-card p-5 text-sm text-fg/60">
              No notes yet — pick a campaign, brand or creator above
              and write the first one.
            </li>
          )}
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-2xl border border-fg/10 bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-fg/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-fg/70">
                  {typeLabel(n.target_type)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-fg">
                  {labelByTarget.get(`${n.target_type}:${n.target_id}`) ??
                    n.target_id.slice(0, 8)}
                </span>
                {n.flag && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${FLAG_CLS[n.flag]}`}
                  >
                    {FLAG_LABELS[n.flag]}
                  </span>
                )}
                <button
                  type="button"
                  disabled={deletingNoteId === n.id}
                  onClick={() => void deleteNote(n.id)}
                  className="rounded-full border border-fg/15 px-3 py-1.5 text-xs font-bold text-fg/70 transition hover:border-red-400/60 hover:text-red-300 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-fg/70">
                {n.note}
              </p>
              <p className="mt-1 text-[11px] text-fg/40">
                {new Date(n.created_at).toLocaleString("en-US")}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
