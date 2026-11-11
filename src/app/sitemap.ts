import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

// Static public pages only — no auth pages (login/signup are not
// indexable), no /contact (it redirects to /support), and no
// campaign detail pages (they are created by brands and go live
// only after funding is verified).
const PAGES = [
  "/",
  "/brands",
  "/campaigns",
  "/pricing",
  "/how-it-works",
  "/rules",
  "/terms",
  "/privacy",
  "/refund",
  "/support",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
  }));
}
