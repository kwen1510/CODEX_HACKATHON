/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      spacing: {
        18: "4.5rem",
      },
      boxShadow: {
        "3xl": "0 28px 80px -28px rgba(15, 23, 42, 0.55)",
      },
    },
  },
  plugins: [],
};
