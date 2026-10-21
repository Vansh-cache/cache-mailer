/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
      },
      colors: {
        ink: { 950: "#0c1219", 900: "#15202b", 700: "#3d4d5c" },
        tide: { 700: "#0f766e", 600: "#0d9488", 50: "#f0fdfa" },
      },
    },
  },
  plugins: [],
};
