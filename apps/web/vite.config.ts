import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@kairo/core': path.resolve(import.meta.dirname, '../../packages/core/src'),
    },
  },
  envPrefix: ['VITE_', 'REACT_APP_'],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
});
