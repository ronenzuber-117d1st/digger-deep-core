import { defineConfig } from 'vite';

export default defineConfig({
  base: '/digger-deep-core/',
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 2500,
  },
});
