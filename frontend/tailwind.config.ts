import type { Config } from "tailwindcss";

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
        // Surfaces: warm ivory paper under cream cards, like good stationery.
        canvas: "#F4EEE2",
        paper: "#FFFCF6",
        sunken: "#F0E9DA",
        ink: {
          DEFAULT: "#1D1915",
          soft: "#2C2620",
        },
        // Every neutral in the app (text-stone-*, border-stone-*, bg-stone-*) is a warm stone.
        stone: {
          50: "#FAF6EE",
          100: "#F2ECDF",
          200: "#E6DECC",
          300: "#D3C9B2",
          400: "#A89D86",
          500: "#7E745F",
          600: "#5E5645",
          700: "#463F32",
          800: "#2E2922",
          900: "#1D1915",
        },
        // Brand: deep Chanakya green. Primary actions, active states, the masthead.
        brand: {
          50: "#EEF5F1",
          100: "#D8E8DF",
          200: "#B1D0BF",
          300: "#80B09A",
          400: "#4C8A71",
          500: "#2A6B54",
          600: "#175240",
          700: "#11412F",
          800: "#0C3124",
          900: "#07231A",
        },
        // Accent: antique gold. Highlights, active nav underline, small emblems.
        saffron: {
          50: "#FBF5E6",
          100: "#F5E8C3",
          200: "#EBD498",
          300: "#E0BE6B",
          400: "#D2A649",
          500: "#B88A2E",
          600: "#946C1F",
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
        // Newsreader: headings and long-form reading.
        serif: ["var(--font-serif)", "Georgia", "Cambria", "serif"],
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
        card: "0 1px 2px rgba(60, 40, 10, 0.05), 0 0 0 1px rgba(60, 40, 10, 0.01)",
        lift: "0 10px 26px -10px rgba(60, 40, 10, 0.28), 0 2px 6px -2px rgba(60, 40, 10, 0.08)",
        pop: "0 18px 44px -14px rgba(40, 25, 5, 0.38), 0 4px 12px -4px rgba(40, 25, 5, 0.10)",
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
