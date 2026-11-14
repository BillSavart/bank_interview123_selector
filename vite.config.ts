import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-admin',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url && /^\/admin\/?(?=\?|$)/.test(req.url)) {
            req.url = req.url.replace(/^\/admin\/?/, '/admin.html');
          }
          next();
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        public: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
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
