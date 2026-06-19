/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0B0F19",
        surface: "#1A1F2E",
        panel: "#1A1F2E",
        line: "#27304a",
        neon: "#00E676",
        profit: "#00E676",
        loss: "#FF1744",
        warn: "#FFD600",
        accent: "#7C3AED",
        text: "#E7ECF5",
        muted: "#8A93A8",
      },
      fontFamily: {
        mono: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      backgroundImage: {
        "dashboard-glow":
          "radial-gradient(circle at 15% 0%, rgba(0, 230, 118, 0.06), transparent 30%), radial-gradient(circle at 85% 10%, rgba(124, 58, 237, 0.07), transparent 26%)",
      },
    },
  },
  plugins: [],
};
