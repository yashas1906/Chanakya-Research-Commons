import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./context/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces: a cool, slightly blue-grey page with crisp white cards.
        canvas: "#EFF1F5",
        paper: "#FFFFFF",
        sunken: "#F4F6F9",
        ink: {
          DEFAULT: "#0F172A",
          soft: "#1E293B",
        },
        // Every neutral in the app (text-stone-*, border-stone-*, bg-stone-*) is a cool slate.
        stone: colors.slate,
        // Brand: Chanakya blue. Used for primary actions, active states and links.
        brand: {
          50: "#EEF2FF",
          100: "#DFE6FE",
          200: "#C2CFFC",
          300: "#9BB0F8",
          400: "#6F88F0",
          500: "#4A63E3",
          600: "#3449CC",
          700: "#2A3BA6",
          800: "#233084",
          900: "#1C2663",
        },
        // Accent: saffron. Small highlights only (logo mark, notices).
        saffron: {
          50: "#FFF8E8",
          100: "#FEEFC8",
          400: "#F7B02F",
          500: "#EC9A0C",
          600: "#C97A06",
        },
        // Integrity watchlist: muted terracotta
        terracotta: {
          50: "#FBF3EF",
          100: "#F6E4DB",
          200: "#EBC6B4",
          500: "#B9633F",
          600: "#A3522F",
          700: "#85411F",
        },
        // Breakout impact: muted sage
        sage: {
          50: "#F2F6F1",
          100: "#E1EBDE",
          200: "#C3D6BD",
          500: "#5E8A5A",
          600: "#4A7247",
          700: "#3B5B39",
        },
      },
      fontFamily: {
        // Inter is the sole typeface. All text uses font-sans.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        body: ["16px", { lineHeight: "26px" }],
        ui: ["15px", { lineHeight: "22px" }],
        meta: ["14px", { lineHeight: "20px" }],
        label: ["12px", { lineHeight: "16px" }],
        h1: ["clamp(1.75rem, 3vw, 2.25rem)", { lineHeight: "1.15" }],
        h2: ["24px", { lineHeight: "30px" }],
        h3: ["18px", { lineHeight: "26px" }],
      },
      letterSpacing: {
        eyebrow: "0.01em",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.05)",
        lift: "0 6px 20px -8px rgba(15, 23, 42, 0.18), 0 2px 6px -2px rgba(15, 23, 42, 0.06)",
        pop: "0 16px 40px -12px rgba(15, 23, 42, 0.28), 0 4px 12px -4px rgba(15, 23, 42, 0.08)",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pop: {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        slidein: {
          "0%": { transform: "translateX(24px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        bump: {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.35)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        rise: "rise 260ms ease-out both",
        fade: "fade 180ms ease-out both",
        pop: "pop 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
        slidein: "slidein 240ms cubic-bezier(0.22, 1, 0.36, 1) both",
        bump: "bump 260ms ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
