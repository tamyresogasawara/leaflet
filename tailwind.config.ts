import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./brand.config.ts",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        accent: "var(--color-accent)",
        ink: "#0B0F19",
        muted: "#475569",
        subtle: "#94A3B8",
        border: "#E2E8F0",
        surface: "#F8FAFC",
        canvas: "#FFFFFF",
        success: "#047857",
        warning: "#B45309",
        error: "#B91C1C",
        "brand-mention": "#047857",
        "competitor-mention": "#B45309",
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        DEFAULT: "6px",
        card: "10px",
      },
      boxShadow: {
        resting: "0 1px 2px rgba(11,15,25,.06)",
        hover: "0 4px 12px rgba(11,15,25,.10)",
      },
    },
  },
  plugins: [],
};

export default config;
