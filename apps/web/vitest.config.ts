import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@/core': fileURLToPath(new URL('../../packages/core/src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'], environment: 'node', maxWorkers: 1 },
});
