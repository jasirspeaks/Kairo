/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: '#0A0A0C',
        surface: '#141418',
        surfaceHigh: '#18181F',
        border: '#2A2A35',
        primary: '#6B21A8',
        primaryLight: '#7C3AED',
        accent: '#C4B5FD',
        accentSoft: '#DDD6FE',
        textPrimary: '#FFFFFF',
        textSecondary: '#A09EB5',
        textMuted: '#6B6880',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Syne', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'purple-glow': '0 0 20px rgba(107, 33, 168, 0.3)',
        'purple-glow-sm': '0 0 10px rgba(107, 33, 168, 0.2)',
        'card': '0 4px 24px rgba(0,0,0,0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      }
    },
  },
  plugins: [],
}