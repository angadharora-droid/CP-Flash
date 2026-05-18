export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#f1f5f9',
          surface: '#ffffff',
          panel: '#f8fafc',
          glass: 'rgba(255, 255, 255, 0.72)',
          sidebar: 'rgba(255, 255, 255, 0.78)',
          sidebarSolid: '#ffffff',
          border: '#e6ebf3',
          borderSoft: '#eef1f7',
          borderStrong: '#cfd6e3',
          divider: '#eef2f8',
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
          gold: '#b45309',
          coral: '#c2410c'
        }
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -8px rgba(15, 23, 42, 0.10)',
        cardHover: '0 1px 2px rgba(15, 23, 42, 0.05), 0 16px 36px -12px rgba(15, 23, 42, 0.14)',
        glass: '0 1px 0 rgba(255, 255, 255, 0.7) inset, 0 12px 36px -16px rgba(15, 23, 42, 0.18)',
        pop: '0 12px 30px -10px rgba(13, 148, 136, 0.45)',
        ring: '0 0 0 1px rgba(15, 23, 42, 0.05)'
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem'
      },
      backgroundImage: {
        'glass-fade': 'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.55) 100%)',
        'aurora':
          'radial-gradient(1100px 540px at 92% -10%, rgba(20,184,166,0.18) 0%, rgba(20,184,166,0) 60%),\
           radial-gradient(900px 480px at -10% 5%, rgba(99,102,241,0.14) 0%, rgba(99,102,241,0) 55%),\
           radial-gradient(700px 480px at 50% 110%, rgba(45,212,191,0.10) 0%, rgba(45,212,191,0) 60%)',
        'accent-stripe': 'linear-gradient(90deg, #14b8a6 0%, #0d9488 100%)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif']
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        }
      },
      animation: {
        'fade-in-up': 'fade-in-up 280ms ease-out both',
        shimmer: 'shimmer 1.8s linear infinite'
      }
    }
  },
  plugins: []
};
