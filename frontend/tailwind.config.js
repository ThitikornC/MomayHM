/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
    './frontend/index.html',
    './frontend/src/**/*.{js,jsx,ts,tsx}',
  ],
  corePlugins: {
    preflight: false,   // Don't reset browser styles — other pages use CSS vars
  },
  theme: {
    extend: {},
  },
  plugins: [],
}
