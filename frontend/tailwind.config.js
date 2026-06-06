export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#A3006A',
        'primary-container': '#C2007F',
        'on-primary': '#ffffff',
        'on-primary-container': '#ffe4f5',
        'primary-fixed': '#ffe4f5',
        'primary-fixed-dim': '#f5b8de',
        'on-primary-fixed': '#3a0020',
        'on-primary-fixed-variant': '#7a004e',
        'inverse-primary': '#f5b8de',

        secondary: '#6f3d74',
        'secondary-container': '#f0d9ec',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#4b254e',
        'secondary-fixed': '#f0d9ec',
        'secondary-fixed-dim': '#dfb5da',
        'on-secondary-fixed': '#261029',
        'on-secondary-fixed-variant': '#5a2e5e',

        tertiary: '#9a5a00',
        'tertiary-container': '#fff0cc',
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#6b3e00',
        'tertiary-fixed': '#fff0cc',
        'tertiary-fixed-dim': '#f4c36d',
        'on-tertiary-fixed': '#2c1800',
        'on-tertiary-fixed-variant': '#744300',

        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',

        background: '#f4f6f8',
        surface: '#f4f6f8',
        'on-surface': '#172026',
        'on-background': '#172026',
        'on-surface-variant': '#5a6872',
        'surface-variant': '#dce3e8',
        'surface-dim': '#d8dee3',
        'surface-bright': '#fbfcfd',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f7f9fa',
        'surface-container': '#eef2f5',
        'surface-container-high': '#e4eaee',
        'surface-container-highest': '#dce3e8',
        outline: '#7c8993',
        'outline-variant': '#cad3da',
        'inverse-surface': '#202a31',
        'inverse-on-surface': '#eff1f3',
        'surface-tint': '#A3006A',

        app: {
          bg: '#f4f6f8',
          surface: '#ffffff',
          panel: '#eef2f5',
          glass: 'rgba(255, 255, 255, 0.92)',
          sidebar: 'rgba(255, 255, 255, 0.96)',
          sidebarSolid: '#ffffff',
          border: '#cad3da',
          borderSoft: '#e4eaee',
          borderStrong: '#A3006A',
          divider: '#dce3e8',
          muted: '#5a6872',
          subtle: '#7c8993',
          text: '#172026',
          body: '#46545e',
          edit: '#fce4f3',
          accent: '#A3006A',
          accentSoft: '#C2007F',
          accentDark: '#7a004e',
          accentTint: 'rgba(163, 0, 106, 0.09)',
          accentRing: 'rgba(163, 0, 106, 0.20)',
          navy: '#21445b',
          navyTint: '#e7f0f5',
          plum: '#6f3d74',
          plumTint: '#f4e7f2',
          ink: '#172026',
          gold: '#b45309',
          coral: '#c2410c'
        }
      },
      boxShadow: {
        card: '0 1px 2px rgba(23, 32, 38, 0.05), 0 18px 44px -34px rgba(23, 32, 38, 0.45)',
        cardHover: '0 4px 12px rgba(23, 32, 38, 0.08), 0 24px 56px -32px rgba(163, 0, 106, 0.35)',
        glass: '0 1px 0 rgba(255, 255, 255, 0.85) inset, 0 18px 44px -34px rgba(23, 32, 38, 0.45)',
        pop: '0 16px 38px -22px rgba(163, 0, 106, 0.52)',
        ring: '0 0 0 1px rgba(15, 23, 42, 0.05)',
        primary: '0 10px 28px -12px rgba(163, 0, 106, 0.55)'
      },
      borderRadius: {
        xl: '0.625rem',
        '2xl': '0.75rem',
        '3xl': '1rem'
      },
      backgroundImage: {
        'glass-fade': 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,249,250,0.9) 100%)',
        aurora: 'linear-gradient(135deg, rgba(163,0,106,0.10) 0%, rgba(111,61,116,0.07) 50%, rgba(154,90,0,0.08) 100%)',
        'accent-stripe': 'linear-gradient(90deg, #A3006A 0%, #6f3d74 100%)',
        'brand-gradient': 'linear-gradient(135deg, #A3006A 0%, #21445b 100%)'
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Hanken Grotesk"', 'system-ui', 'sans-serif']
      },
      fontSize: {
        'display-lg': ['32px', { lineHeight: '40px', letterSpacing: '0', fontWeight: '700' }],
        display: ['32px', { lineHeight: '40px', letterSpacing: '0', fontWeight: '700' }],
        'display-mobile': ['24px', { lineHeight: '30px', letterSpacing: '0', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', letterSpacing: '0', fontWeight: '600' }],
        'headline-sm': ['20px', { lineHeight: '28px', letterSpacing: '0', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-caps': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '700' }],
        'label-sm': ['11px', { lineHeight: '14px', fontWeight: '500' }]
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
        'fade-in-up': 'fade-in-up 240ms ease-out both',
        'fade-in': 'fade-in 180ms ease-out both',
        'slide-in-right': 'slide-in-right 220ms ease-out both',
        shimmer: 'shimmer 1.8s linear infinite',
        shake: 'shake 480ms cubic-bezier(.36,.07,.19,.97) both'
      }
    }
  },
  plugins: []
};
