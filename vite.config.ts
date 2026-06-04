import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // local dev: forward /api to the LLM proxy (run `npm start` in ./server)
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
