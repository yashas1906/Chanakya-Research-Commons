import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./context/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Every colour is a CSS variable (see globals.css) so light/dark themes swap the whole palette.
      colors: {
        canvas: v("canvas"),
        paper: v("paper"),
        sunken: v("sunken"),
        // Fixed deep red that keeps white text readable in both themes (hero bands, logo, chat bubbles).
        deep: v("deep"),
        ink: {
          DEFAULT: v("ink"),
          soft: v("ink-soft"),
        },
        stone: {
          50: v("stone-50"),
          100: v("stone-100"),
          200: v("stone-200"),
          300: v("stone-300"),
          400: v("stone-400"),
          500: v("stone-500"),
          600: v("stone-600"),
          700: v("stone-700"),
          800: v("stone-800"),
          900: v("stone-900"),
        },
        brand: {
          50: v("brand-50"),
          100: v("brand-100"),
          200: v("brand-200"),
          300: v("brand-300"),
          400: v("brand-400"),
          500: v("brand-500"),
          600: v("brand-600"),
          700: v("brand-700"),
          800: v("brand-800"),
          900: v("brand-900"),
        },
        saffron: {
          50: v("saffron-50"),
          100: v("saffron-100"),
          200: v("saffron-200"),
          300: v("saffron-300"),
          400: v("saffron-400"),
          500: v("saffron-500"),
          600: v("saffron-600"),
        },
        terracotta: {
          50: v("terracotta-50"),
          100: v("terracotta-100"),
          200: v("terracotta-200"),
          500: v("terracotta-500"),
          600: v("terracotta-600"),
          700: v("terracotta-700"),
        },
        sage: {
          50: v("sage-50"),
          100: v("sage-100"),
          200: v("sage-200"),
          500: v("sage-500"),
          600: v("sage-600"),
          700: v("sage-700"),
        },
      },
      fontFamily: {
        // Playfair Display: headings. Outfit: everything else.
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
        card: "0 1px 0 rgba(28, 10, 12, 0.03)",
        lift: "0 12px 28px -14px rgba(28, 10, 12, 0.30)",
        pop: "0 20px 48px -16px rgba(28, 10, 12, 0.42), 0 4px 12px -4px rgba(28, 10, 12, 0.10)",
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
