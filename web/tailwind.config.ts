import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f7f5f0",
        bgstrip: "#f1ede4",
        ink: "#1a1f2c",
        muted: "#4a5266",
        soft: "#7a8294",
        primary: "#0f2942",
        accent: "#0d6b52",
        warn: "#a15a13",
        danger: "#8a2a1f",
        info: "#205b80",
      },
      fontFamily: {
        serif: ["Source Serif 4", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
} satisfies Config;
