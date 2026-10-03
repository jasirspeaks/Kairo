/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}", "../web/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: '#0D0715',
        surface: '#160D21',
        surfaceSecondary: '#211333',
        surfaceHigh: '#241931',
        border: '#302044',
        primary: '#7042C5',
        primaryHover: '#8050D9',
        primaryLight: '#8050D9',
        accent: '#7042C5',
        glow: '#BFA3E8',
        textPrimary: '#F7F2FC',
        textSecondary: '#B4A7C2',
        textMuted: '#796B8A',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        display: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        caption: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        footnote: ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '0em' }],
        subhead: ['0.9375rem', { lineHeight: '1.25rem', letterSpacing: '-0.005em' }],
        body: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em' }],
        title3: ['1.25rem', { lineHeight: '1.625rem', letterSpacing: '-0.015em' }],
        title2: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.018em' }],
        title1: ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em' }],
        largeTitle: ['2.125rem', { lineHeight: '2.5rem', letterSpacing: '-0.022em' }],
      },
      spacing: {
        '0.5': '0.125rem',
        '1.5': '0.375rem',
        '2.5': '0.625rem',
        '3.5': '0.875rem',
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'safe-t': 'env(safe-area-inset-top, 0px)',
        'nav': '64px',
      },
      boxShadow: {
        'purple-glow': '0 0 24px rgba(112, 66, 197, 0.35)',
        'purple-glow-sm': '0 0 12px rgba(112, 66, 197, 0.25)',
        'card': '0 1px 2px rgba(0, 0, 0, 0.24), 0 2px 8px rgba(0, 0, 0, 0.16)',
        'card-hover': '0 2px 4px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.28)',
        'nav': '0 -1px 0 rgba(255, 255, 255, 0.04), 0 -8px 24px rgba(0, 0, 0, 0.3)',
        'sheet': '0 -12px 40px rgba(0, 0, 0, 0.45)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        sheet: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'sheet-up': 'sheetUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        shimmer: 'shimmer 1.8s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        sheetUp: { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
        shimmer: {
          '0%': { transform: 'translate(-60%, -60%)' },
          '100%': { transform: 'translate(60%, 60%)' },
        },
      }
    },
  },
  plugins: [],
};
