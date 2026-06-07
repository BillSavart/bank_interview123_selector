import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Build timestamp, baked into the bundle so the About page can show "最後更新".
  // Evaluated when the build runs (i.e. at deploy time in CI).
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
