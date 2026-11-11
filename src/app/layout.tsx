import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import HelpBubble from "@/components/HelpBubble";
import NavigationLoader from "@/components/NavigationLoader";
import ToastProvider from "@/components/Toast";
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
  title: {
    default: "Get Paid to Post on TikTok, Instagram & YouTube",
    template: "%s | Get Paid To Post",
  },
  description:
    "Post short clips on TikTok, Instagram and YouTube and get paid per verified view. No follower minimum — earnings are per view only, up to the campaign's per-post cap.",
  metadataBase: new URL(SITE_URL),
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  openGraph: {
    title: "Get Paid To Post — Post Clips. Get Paid Per View.",
    description:
      "Creators post short clips for brands and get paid per view. No follower minimum.",
    url: SITE_URL,
    siteName: BRAND_NAME,
    type: "website",
    images: [{ url: "/og-image.png", width: 1024, height: 1024, alt: "Get Paid To Post logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Get Paid To Post — Post Clips. Get Paid Per View.",
    description:
      "Creators post short clips for brands and get paid per view. No follower minimum.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#C6FF00",
};

// Runs before first paint so the saved theme applies without a flash:
// reads localStorage ("gptp-theme", "dark" | "light") and sets
// data-theme on <html>. Default is dark.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("gptp-theme");if(t!=="light"&&t!=="dark")t="dark";document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${archivo.variable} ${inter.variable}`}
    >
      <body className="min-h-screen bg-ink font-sans text-fg antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ToastProvider>
          <NavigationLoader />
          <Navbar />
          <main className="mx-auto min-h-[60vh] w-full max-w-6xl px-4 pb-24 pt-6 md:pb-10">
            {children}
          </main>
          <Footer />
          <BottomNav />
          <HelpBubble />
        </ToastProvider>
      </body>
    </html>
  );
}
