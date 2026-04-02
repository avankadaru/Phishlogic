import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Only enable proxy if VITE_API_BASE_URL is NOT set (local development)
    // When VITE_API_BASE_URL is set, admin UI makes direct requests to production
    proxy: process.env.VITE_API_BASE_URL ? {} : {
      '/api/': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
