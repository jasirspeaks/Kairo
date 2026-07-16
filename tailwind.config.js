/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: '#F6F0FF',
        surface: '#FFFFFF',
        surfaceHigh: '#F1E8FF',
        border: '#E5D6FF',
        primary: '#8266B3',
        primaryLight: '#9580C2',
        accent: '#8266B3',
        accentSoft: '#E5D6FF',
        textPrimary: '#331A47',
        textSecondary: '#5C4470',
        textMuted: '#8B7A9C',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Syne', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'purple-glow': '0 0 24px rgba(229, 214, 255, 0.8)',
        'purple-glow-sm': '0 0 12px rgba(229, 214, 255, 0.6)',
        'card': '0 2px 12px rgba(51, 26, 71, 0.06)',
        'card-hover': '0 4px 20px rgba(51, 26, 71, 0.1)',
        'nav': '0 -2px 16px rgba(51, 26, 71, 0.08)',
        'sheet': '0 -8px 30px rgba(51, 26, 71, 0.15)',
      },
      spacing: {
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'safe-t': 'env(safe-area-inset-top, 0px)',
        'nav': '64px',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'sheet-up': 'sheetUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        sheetUp: { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      }
    },
  },
  plugins: [],
}