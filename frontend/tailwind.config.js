/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0F0F12',
          800: '#15151A',
          700: '#1E1E26',
          600: '#2A2A35',
        }
      }
    },
  },
  plugins: [],
}
