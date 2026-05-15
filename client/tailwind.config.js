export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#f4f7fb',
          surface: '#ffffff',
          panel: '#f8fafc',
          sidebar: '#0f172a',
          sidebarSoft: '#17233b',
          border: '#dbe3ee',
          borderStrong: '#aebbd0',
          muted: '#64748b',
          text: '#111827',
          edit: '#edf7f6',
          accent: '#0f766e',
          accentSoft: '#0b5f59',
          gold: '#b45309',
          coral: '#c2410c'
        }
      },
      boxShadow: {
        card: '0 14px 30px rgba(15, 23, 42, 0.08)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
