// Minimum engagement rate for an approved clip (P0 batch 3,
// Turn's decision): (likes + comments) / views must be at least
// 1%. Likes and comments ONLY — shares and saves never count —
// and the rule applies at any view count (1 view or 1M). The
// check is enforced server-side in POST /api/admin/review; the
// admin list shows the same computed rate so the owner sees it
// before deciding.

export const MIN_ENGAGEMENT_RATE = 0.01;

/** Engagement as a fraction (0.004 = 0.4%), or null when views is 0. */
export function engagementRate(
  likes: number,
  comments: number,
  views: number
): number | null {
  if (!views || views <= 0) return null;
  return (Math.max(0, likes) + Math.max(0, comments)) / views;
}

/** "0.4%" — one decimal, for display and error messages. */
export function formatEngagementRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
