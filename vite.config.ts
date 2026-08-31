import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // Match the original working AI Studio Preview path. Production builds get
  // an empty value and continue to use the server-side provider route.
  const aiStudioPreviewKey = mode === 'production' ? '' : (env.GEMINI_API_KEY || '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(aiStudioPreviewKey),
    },
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
            gemini: ['@google/genai'],
            icons: ['lucide-react'],
            motion: ['framer-motion'],
            react: ['react', 'react-dom'],
          },
        },
      },
    },
  };
});
