import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // TryShoot-style near-black theme. Full yellow #FFDE00 stays the
        // brand accent; the old dark purple (#120826 / #1E1233) is gone.
        ink: "#0A0A0B",
        card: "#141417",
        cardlight: "#1D1D21",
        sun: "#FFDE00",
        sundark: "#E6C800",
      },
      fontFamily: {
        // Loaded with next/font/google in layout.tsx — the fonts are
        // bundled and self-hosted at build time, so there is no runtime
        // fetch to Google Fonts (the old purple-screen bug).
        display: [
          "var(--font-archivo)",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        sans: [
          "var(--font-inter)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
export default config;
