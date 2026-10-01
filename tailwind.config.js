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
        sans: ['"DM Serif Display"', '"DM Serif Text"', '"Noto Sans Lao"', 'serif'],
        serif: ['"DM Serif Display"', '"DM Serif Text"', 'serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#052659',
          light: '#0c3a80',
          dark: '#031738',
        }
      }
    },
  },
  plugins: [],
}
