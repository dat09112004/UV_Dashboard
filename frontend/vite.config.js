import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// F07 & O06 Fix: Nạp biến môi trường từ .env theo mode qua loadEnv và tách chunk ExcelJS / Recharts
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget =
    process.env.VITE_BACKEND_PROXY_TARGET ||
    env.VITE_BACKEND_PROXY_TARGET ||
    'http://127.0.0.1:4000';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/exceljs')) return 'exceljs';
            if (id.includes('node_modules/recharts')) return 'charts';
          },
        },
      },
    },
    server: {
      port: 3000,
      allowedHosts: ['terminal.local'],
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
