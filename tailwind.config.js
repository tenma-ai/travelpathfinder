/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        black: '#000',
        white: '#fff',
      },
      textColor: {
        primary: '#000',
        secondary: '#333',
        muted: '#555',
        light: '#fff',
      },
      backgroundColor: {
        primary: '#fff',
        secondary: '#f5f5f5',
        dark: '#242424',
        light: '#fff',
      },
    },
  },
  plugins: [],
} 