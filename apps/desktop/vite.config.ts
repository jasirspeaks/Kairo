import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@kairo/core': path.resolve(import.meta.dirname, '../../packages/core/src'),
      '@kairo/api': path.resolve(import.meta.dirname, '../../packages/api/src'),
      '@kairo/platform': path.resolve(import.meta.dirname, '../../packages/platform/src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*', 'REACT_APP_'],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
