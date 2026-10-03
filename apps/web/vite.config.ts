import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      "@kairo/core": path.resolve(import.meta.dirname, '../../packages/core/src'),
      '@kairo/api': path.resolve(import.meta.dirname, '../../packages/api/src'),
      '@kairo/platform': path.resolve(import.meta.dirname, '../../packages/platform/src'),
    },
  },
  envDir: path.resolve(import.meta.dirname, '../../'),
  envPrefix: ['VITE_', 'REACT_APP_', 'EXPO_PUBLIC_'],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
});
