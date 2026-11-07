import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BRAND_NAME, SITE_URL } from "@/lib/constants";
import "./globals.css";

// next/font/google bundles these fonts at build time and self-hosts them
// from the app itself — no runtime request to Google Fonts, so first paint
// is never blocked waiting on a font fetch.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${BRAND_NAME} — Get Paid to Post on TikTok, Instagram & YouTube`,
  description:
    "Post short clips on TikTok, Instagram and YouTube and get paid per view. No follower minimum. Base pay $10 per approved post, plus view bonuses.",
  metadataBase: new URL(SITE_URL),
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: `${BRAND_NAME} — Post Clips. Get Paid Per View.`,
    description:
      "Creators post short clips for brands and get paid per view. No follower minimum.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${archivo.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-ink font-sans text-white antialiased">
        <Navbar />
        <main className="mx-auto min-h-[60vh] w-full max-w-6xl px-4 pb-16 pt-6 md:pb-10">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
