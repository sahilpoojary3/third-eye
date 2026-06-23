import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        clear: "#0E7C3A",
        clearBright: "#22C55E",
        caution: "#B45309",
        cautionBright: "#F59E0B",
        hazard: "#991B1B",
        hazardBright: "#EF4444",
        ink: "#0A0A0A",
        paper: "#FAFAFA",
      },
      minHeight: { tap: "56px" },
      minWidth: { tap: "56px" },
    },
  },
  plugins: [],
};
export default config;
