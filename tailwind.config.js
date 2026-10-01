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
        sans: ['"DM Sans"', '"Noto Sans Lao"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
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
