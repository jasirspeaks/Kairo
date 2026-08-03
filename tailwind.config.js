/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Blueprint dark palette — locked values, do not adjust ad hoc.
        bg: '#121018',
        surface: '#1A1625',
        surfaceSecondary: '#231D32',
        // Kept for backward compatibility with existing components — a
        // slightly-raised dark surface, analogous to the old light-mode
        // "surfaceHigh" (was a step lighter than surface; here too).
        surfaceHigh: '#282235',
        border: '#322A45',
        primary: '#8B6CFF',
        primaryHover: '#9A7BFF',
        // Kept for backward compatibility — same role as primaryHover,
        // used by existing Button.tsx hover states.
        primaryLight: '#9A7BFF',
        accent: '#8B6CFF',
        glow: '#CDB8FF',
        textPrimary: '#F6F4FC',
        textSecondary: '#B6ADC8',
        // Derived, not in the Blueprint's token list: a muted tertiary tone
        // for the quietest text (timestamps, placeholder copy). Sits between
        // textSecondary and border in lightness.
        textMuted: '#7A7290',
      },
      fontFamily: {
        // Single family across UI and headings — hierarchy comes from
        // size/weight/tracking, not a separate decorative display face.
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        // Apple-style scale: tight ratio between steps, explicit line-height
        // and letter-spacing per step (tracking tightens as size grows).
        caption: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],      // 11px
        footnote: ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '0em' }],    // 13px
        subhead: ['0.9375rem', { lineHeight: '1.25rem', letterSpacing: '-0.005em' }], // 15px
        body: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em' }],      // 17px
        title3: ['1.25rem', { lineHeight: '1.625rem', letterSpacing: '-0.015em' }],   // 20px
        title2: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.018em' }],   // 22px
        title1: ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em' }],    // 28px
        largeTitle: ['2.125rem', { lineHeight: '2.5rem', letterSpacing: '-0.022em' }],// 34px
      },
      spacing: {
        // Explicit 4px-base rhythm for consistent card/section gaps.
        '0.5': '0.125rem',
        '1.5': '0.375rem',
        '2.5': '0.625rem',
        '3.5': '0.875rem',
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'safe-t': 'env(safe-area-inset-top, 0px)',
        'nav': '64px',
      },
      boxShadow: {
        // Glows recalculated for a dark surface — light-mode drop-shadow
        // rgba values (dark shadow on white) read as muddy here; these are
        // ambient light glows instead, matching the primary/glow accents.
        'purple-glow': '0 0 24px rgba(139, 108, 255, 0.35)',
        'purple-glow-sm': '0 0 12px rgba(139, 108, 255, 0.25)',
        'card': '0 1px 2px rgba(0, 0, 0, 0.24), 0 2px 8px rgba(0, 0, 0, 0.16)',
        'card-hover': '0 2px 4px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.28)',
        'nav': '0 -1px 0 rgba(255, 255, 255, 0.04), 0 -8px 24px rgba(0, 0, 0, 0.3)',
        'sheet': '0 -12px 40px rgba(0, 0, 0, 0.45)',
      },
      transitionTimingFunction: {
        // Apple-style spring: slight overshoot then settle, rather than a
        // hard ease-out stop. Use for card/button state changes.
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        // iOS sheet-presentation curve — decelerate into place, no overshoot.
        // (unchanged from before; this one was already correctly modeled)
        sheet: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'sheet-up': 'sheetUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        sheetUp: { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      }
    },
  },
  plugins: [],
}