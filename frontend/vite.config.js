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
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
