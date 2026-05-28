import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#070a0f",
          900: "#0c1018",
          850: "#111723",
          800: "#151c29",
          700: "#202938"
        },
        cyanfire: {
          500: "#22d3ee",
          400: "#67e8f9"
        },
        ember: {
          400: "#f5b849"
        }
      },
      boxShadow: {
        phone: "0 22px 80px rgba(0, 0, 0, 0.42)",
        glow: "0 0 0 1px rgba(34, 211, 238, 0.2), 0 18px 48px rgba(34, 211, 238, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
