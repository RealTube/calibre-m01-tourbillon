import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    // the single-file artifact can't fetch split chunks, so inline the film's lazy imports there
    rollupOptions: mode === 'artifact' ? { output: { codeSplitting: false } } : {},
  },
}));
