import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => ({
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // File watching can be disabled by the AI Studio runtime to prevent preview flicker.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 750,
      rollupOptions: {
        output: {
          manualChunks: {
            canvas: ['konva', 'react-konva'],
            icons: ['lucide-react'],
            motion: ['framer-motion'],
            react: ['react', 'react-dom'],
          },
        },
      },
    },
}));
