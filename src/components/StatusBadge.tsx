import type { SubmissionStatus } from "@/lib/types";

const MAP: Record<SubmissionStatus, { label: string; cls: string }> = {
  pending: { label: "Under Review", cls: "bg-yellow-500/20 text-yellow-300" },
  approved: { label: "Approved", cls: "bg-green-500/20 text-green-300" },
  rejected: { label: "Rejected", cls: "bg-red-500/20 text-red-300" },
  revoked: { label: "Revoked", cls: "bg-fg/10 text-fg/60" },
};

export default function StatusBadge({ status }: { status: SubmissionStatus }) {
  const s = MAP[status] ?? MAP.pending;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
