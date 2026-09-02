import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'global': 'globalThis'
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-icons': ['lucide-react'],
          'vendor-hls': ['hls.js'],
          'vendor-state': ['zustand']
        }
      }
    }
  }
});
