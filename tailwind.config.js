/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // status palette used across tree, badges, diff gutters
        keep:    { DEFAULT: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' }, // only in A
        add:     { DEFAULT: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' }, // only in B
        change:  { DEFAULT: '#d97706', bg: '#fffbeb', border: '#fde68a' }, // modified
        conflict:{ DEFAULT: '#dc2626', bg: '#fef2f2', border: '#fecaca' }, // needs review
        same:    { DEFAULT: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }, // identical
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};