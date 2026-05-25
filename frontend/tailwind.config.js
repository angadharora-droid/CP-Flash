export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // M3 brand palette — pink/magenta primary, teal secondary, amber tertiary.
        primary: '#8c0056',
        'primary-container': '#b70072',
        'on-primary': '#ffffff',
        'on-primary-container': '#ffcbdd',
        'primary-fixed': '#ffd9e5',
        'primary-fixed-dim': '#ffb0cf',
        'on-primary-fixed': '#3d0023',
        'on-primary-fixed-variant': '#8c0056',
        'inverse-primary': '#ffb0cf',

        secondary: '#006a61',
        'secondary-container': '#86f2e4',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#006f66',
        'secondary-fixed': '#89f5e7',
        'secondary-fixed-dim': '#6bd8cb',
        'on-secondary-fixed': '#00201d',
        'on-secondary-fixed-variant': '#005049',

        tertiary: '#653e00',
        'tertiary-container': '#865400',
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#ffd19c',
        'tertiary-fixed': '#ffddb8',
        'tertiary-fixed-dim': '#ffb95f',
        'on-tertiary-fixed': '#2a1700',
        'on-tertiary-fixed-variant': '#653e00',

        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',

        background: '#f7f9fb',
        surface: '#f7f9fb',
        'on-surface': '#191c1e',
        'on-background': '#191c1e',
        'on-surface-variant': '#584049',
        'surface-variant': '#e0e3e5',
        'surface-dim': '#d8dadc',
        'surface-bright': '#f7f9fb',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f2f4f6',
        'surface-container': '#eceef0',
        'surface-container-high': '#e6e8ea',
        'surface-container-highest': '#e0e3e5',
        outline: '#8b7079',
        'outline-variant': '#dfbec9',
        'inverse-surface': '#2d3133',
        'inverse-on-surface': '#eff1f3',
        'surface-tint': '#b70072',

        // Legacy `app-*` tokens kept for backward compatibility with existing
        // pages — remapped onto the new palette so old class names still look right.
        app: {
          bg: '#f7f9fb',
          surface: '#ffffff',
          panel: '#f2f4f6',
          glass: 'rgba(255, 255, 255, 0.7)',
          sidebar: 'rgba(255, 255, 255, 0.92)',
          sidebarSolid: '#ffffff',
          border: '#dfbec9',
          borderSoft: '#eceef0',
          borderStrong: '#b70072',
          divider: '#e6e8ea',
          muted: '#584049',
          subtle: '#8b7079',
          text: '#191c1e',
          body: '#584049',
          edit: '#fff0f6',
          accent: '#8c0056',
          accentSoft: '#b70072',
          accentDark: '#8c0056',
          accentTint: 'rgba(183, 0, 114, 0.08)',
          accentRing: 'rgba(183, 0, 114, 0.18)',
          navy: '#1e3a5f',
          navyTint: '#eaf1f8',
          plum: '#7c3f74',
          plumTint: '#f6eefa',
          ink: '#111827',
          gold: '#b45309',
          coral: '#c2410c'
        }
      },
      boxShadow: {
        card: '0 1px 2px rgba(140, 0, 86, 0.04), 0 8px 32px 0 rgba(140, 0, 86, 0.05)',
        cardHover: '0 2px 4px rgba(140, 0, 86, 0.06), 0 16px 40px 0 rgba(140, 0, 86, 0.10)',
        glass: '0 1px 0 rgba(255, 255, 255, 0.75) inset, 0 8px 32px 0 rgba(140, 0, 86, 0.08)',
        pop: '0 14px 34px -18px rgba(183, 0, 114, 0.48)',
        ring: '0 0 0 1px rgba(15, 23, 42, 0.05)',
        primary: '0 8px 24px -8px rgba(183, 0, 114, 0.45)'
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem'
      },
      backgroundImage: {
        'glass-fade': 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.86) 100%)',
        'aurora':
          'linear-gradient(135deg, rgba(183,0,114,0.10) 0%, rgba(0,106,97,0.08) 48%, rgba(101,62,0,0.06) 100%)',
        'accent-stripe': 'linear-gradient(90deg, #b70072 0%, #8c0056 100%)',
        'brand-gradient': 'linear-gradient(135deg, #b70072 0%, #8c0056 100%)'
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Hanken Grotesk"', 'system-ui', 'sans-serif']
      },
      fontSize: {
        // M3 type scale (display / headline / body / label).
        'display-lg':    ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display':       ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-mobile':['24px', { lineHeight: '30px', fontWeight: '700' }],
        'headline-md':   ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'headline-sm':   ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body-lg':       ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-md':       ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-caps':    ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '700' }],
        'label-sm':      ['11px', { lineHeight: '14px', fontWeight: '500' }]
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '15%': { transform: 'translateX(-7px)' },
          '30%': { transform: 'translateX(6px)' },
          '45%': { transform: 'translateX(-5px)' },
          '60%': { transform: 'translateX(4px)' },
          '75%': { transform: 'translateX(-2px)' },
          '90%': { transform: 'translateX(1px)' }
        }
      },
      animation: {
        'fade-in-up': 'fade-in-up 280ms ease-out both',
        'fade-in': 'fade-in 200ms ease-out both',
        'slide-in-right': 'slide-in-right 240ms ease-out both',
        shimmer: 'shimmer 1.8s linear infinite',
        shake: 'shake 480ms cubic-bezier(.36,.07,.19,.97) both'
      }
    }
  },
  plugins: []
};
