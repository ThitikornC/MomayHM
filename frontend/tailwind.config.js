import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'index.html').replace(/\\/g, '/'),
    path.join(__dirname, 'src/**/*.{js,jsx,ts,tsx}').replace(/\\/g, '/'),
  ],
  corePlugins: {
    preflight: false,   // Don't reset browser styles — other pages use CSS vars
  },
  theme: {
    extend: {},
  },
  plugins: [],
}
