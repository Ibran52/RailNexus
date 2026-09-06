/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rail: {
          navy: '#0B192C',
          'navy-dark': '#060E18',
          'navy-light': '#1E293B',
          'navy-muted': '#334155',
          green: '#10B981',
          'green-dark': '#059669',
          'green-bg': '#ECFDF5',
          'green-border': '#A7F3D0',
          red: '#EF4444',
          'red-dark': '#DC2626',
          'red-bg': '#FEF2F2',
          'red-border': '#FECACA',
          orange: '#F59E0B',
          'orange-dark': '#D97706',
          'orange-bg': '#FFFBEB',
          'orange-border': '#FDE68A',
          blue: '#2563EB',
          'blue-dark': '#1D4ED8',
          'blue-bg': '#EFF6FF',
          'blue-border': '#BFDBFE',
          gray: '#F8FAFC',
          'gray-card': '#FFFFFF',
          border: '#E2E8F0',
          text: '#0F172A',
          muted: '#64748B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'subtle': '0 1px 3px rgba(0, 0, 0, 0.05)',
        'card': '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02)',
      },
    },
  },
  plugins: [],
}
