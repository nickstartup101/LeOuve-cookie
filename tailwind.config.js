/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Noto Sans Lao"', 'sans-serif'],
        serif: ['"DM Serif Display"', '"DM Serif Text"', 'serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#4f0303',
          light: '#680404',
          dark: '#380202',
        }
      }
    },
  },
  plugins: [],
}
