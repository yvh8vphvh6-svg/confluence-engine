/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // themed via CSS custom properties (channels) so /opacity modifiers work
        background: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--sur) / <alpha-value>)",
        panel: "rgb(var(--sur) / <alpha-value>)",
        surface2: "rgb(var(--sur2) / <alpha-value>)",
        line: "rgb(var(--bd) / <alpha-value>)",
        neon: "rgb(var(--ac) / <alpha-value>)",
        accent: "rgb(var(--ac2) / <alpha-value>)",
        glow: "rgb(var(--gl) / <alpha-value>)",
        text: "rgb(var(--tx) / <alpha-value>)",
        muted: "rgb(var(--mu) / <alpha-value>)",
        // semantic colors stay fixed (green=profit, red=loss, yellow=warn)
        profit: "#00E676",
        loss: "#FF1744",
        warn: "#FFD600",
      },
      fontFamily: {
        display: ["var(--fd, ui-sans-serif)", "system-ui", "sans-serif"],
        body: ["var(--fb, ui-sans-serif)", "system-ui", "sans-serif"],
        mono: ["var(--fm, ui-monospace)", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
