import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Modern target = less transpilation, smaller/faster-parsing JS (better FCP/INP).
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Split the stable React runtime into its own long-cached chunk.
        manualChunks(id) {
          // Stable vendor chunks: cached long-term across app deploys.
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          // Recharts (+ its d3 deps) is only needed by chart pages — keep it in
          // one shared chunk instead of duplicating it across lazy page chunks.
          if (/node_modules[\\/](recharts|d3-|victory-vendor|decimal\.js-light)/.test(id)) return 'recharts';
          return undefined;
        },
      },
    },
  },
});
