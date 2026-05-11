import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0509",
          900: "#14090f",
          800: "#1f1219",
          700: "#2a1c25",
          600: "#3a2733",
        },
        mist: {
          100: "#e7eef3",
          300: "#b8cad8",
          500: "#6f8fa6",
          700: "#3d5566",
          glow: "#b8e0ff",
        },
        vermilion: {
          300: "#d99c8c",
          500: "#b04438",
          700: "#621c14",
        },
        crimson: {
          300: "#de7f8a",
          500: "#c1283a",
          700: "#8a0d1c",
        },
        gold: {
          100: "#f5e7c4",
          300: "#e0c684",
          500: "#b89540",
          700: "#8a6d24",
        },
        washi: {
          50: "#f5efe1",
          100: "#ebe2c9",
          200: "#d8c9a3",
          700: "#5c5340",
          900: "#2e2818",
        },
        moss: {
          500: "#6b8a4e",
        },
      },
      fontFamily: {
        display: ['"Yuji Syuku"', "serif"],
        serif: ['"Shippori Mincho B1"', '"Yuji Syuku"', "serif"],
        sans: ['"Noto Sans JP"', "system-ui", "sans-serif"],
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      boxShadow: {
        elev1: "inset 0 0 0 1px rgba(184, 149, 64, 0.18)",
        elev2:
          "0 0 24px 0 rgba(184,224,255,0.10), inset 0 0 0 1px rgba(184,149,64,0.30)",
        elev3:
          "0 0 48px 0 rgba(184,224,255,0.18), 0 8px 32px 0 rgba(10,5,9,0.7)",
      },
    },
  },
  plugins: [],
} satisfies Config;
