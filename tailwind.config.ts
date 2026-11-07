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
        // TryShoot-style theme. Accent is lime green #C6FF00.
        // bg / card / fg are CSS variables (defined in globals.css) so
        // the Light Mode toggle (data-theme on <html>) flips the whole
        // palette: dark is pure black #0A0A0A / cards #1A1A1A, light is
        // white #FFFFFF / cards #F4F4F5. Lime stays the accent in both.
        ink: "rgb(var(--bg) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        cardlight: "rgb(var(--cardlight) / <alpha-value>)",
        lime: "#C6FF00",
        limedark: "#A8D400",
        fg: "rgb(var(--fg) / <alpha-value>)",
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
