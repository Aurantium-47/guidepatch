import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@/core': fileURLToPath(new URL('../../packages/core/src', import.meta.url)) } },
  server: { proxy: { '/api': 'http://127.0.0.1:4318' } },
  build: { emptyOutDir: false },
});
