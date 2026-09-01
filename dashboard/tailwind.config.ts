import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        obsidian: "#0a0a0a",
        carbon: "#101010",
        graphite: "#212121",
        iron: "#383838",
        ash: "#474747",
        smoke: "#8a8a8a",
        chalk: "#f3f3f3",
        "signal-white": "#ffffff",
        "compass-gold": "#6f6759",
        "gold-bright": "#d4af37",
        "pulse-green": "#98ff38",
        "neon-rose": "#f43f5e",
        "accent-orange": "#f97316",
        cobalt: "#3b82f6",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "Space Grotesk", "monospace"],
      },
      animation: {
        "slow-spin": "slow-spin 20s linear infinite",
        "pulse-glow": "pulse-glow 2s infinite ease-in-out",
      },
      keyframes: {
        "slow-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4", transform: "scale(0.9)" },
          "50%": { opacity: "1", transform: "scale(1.2)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
