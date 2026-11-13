/** Relative time ("2h ago", "3d ago") for admin lists. Pure
 *  formatting — no data, nothing invented: the input is the real
 *  stored timestamp. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "unknown time";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown time";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
