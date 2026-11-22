import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Editorial surface system (light only)
        canvas: "#FAF9F6", // warm alabaster / linen
        paper: "#FFFFFF", // elevated cards
        sunken: "#F5F4F0", // warm-stone secondary surface
        ink: {
          DEFAULT: "#18181B",
          soft: "#1E293B",
        },
        // Integrity watchlist: muted terracotta / amber
        terracotta: {
          50: "#FBF3EF",
          100: "#F6E4DB",
          200: "#EBC6B4",
          500: "#B9633F",
          600: "#A3522F",
          700: "#85411F",
        },
        // Breakout impact: muted sage / emerald
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
        serif: ["var(--font-serif)", "Georgia", "Cambria", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        eyebrow: "0.14em",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slidein: {
          "0%": { transform: "translateX(24px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
      animation: {
        rise: "rise 220ms ease-out both",
        slidein: "slidein 240ms cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
export default config;
