export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#f5f7fb',
          surface: '#ffffff',
          panel: '#f8fafc',
          glass: 'rgba(255, 255, 255, 0.88)',
          sidebar: 'rgba(255, 255, 255, 0.92)',
          sidebarSolid: '#ffffff',
          border: '#dde5ef',
          borderSoft: '#edf2f8',
          borderStrong: '#b8c4d4',
          divider: '#e7edf5',
          muted: '#64748b',
          subtle: '#94a3b8',
          text: '#0f172a',
          body: '#334155',
          edit: '#f0fdfa',
          accent: '#0d9488',
          accentSoft: '#14b8a6',
          accentDark: '#0f766e',
          accentTint: '#e6fffb',
          accentRing: 'rgba(13, 148, 136, 0.18)',
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
        card: '0 1px 2px rgba(15, 23, 42, 0.05), 0 10px 26px -18px rgba(15, 23, 42, 0.20)',
        cardHover: '0 2px 4px rgba(15, 23, 42, 0.06), 0 18px 38px -22px rgba(15, 23, 42, 0.24)',
        glass: '0 1px 0 rgba(255, 255, 255, 0.75) inset, 0 18px 48px -28px rgba(15, 23, 42, 0.26)',
        pop: '0 14px 34px -18px rgba(13, 148, 136, 0.48)',
        ring: '0 0 0 1px rgba(15, 23, 42, 0.05)'
      },
      borderRadius: {
        xl: '0.5rem',
        '2xl': '0.5rem',
        '3xl': '0.625rem'
      },
      backgroundImage: {
        'glass-fade': 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.86) 100%)',
        'aurora':
          'linear-gradient(135deg, rgba(13,148,136,0.10) 0%, rgba(30,58,95,0.08) 48%, rgba(180,83,9,0.08) 100%)',
        'accent-stripe': 'linear-gradient(90deg, #0d9488 0%, #1e3a5f 100%)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif']
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
