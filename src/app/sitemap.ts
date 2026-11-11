import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

// Static public pages only — no auth pages beyond login/signup,
// no campaign detail pages (they are created by brands and go
// live only after funding is verified).
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
  "/login",
  "/signup",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date("2026-11-11"),
  }));
}
