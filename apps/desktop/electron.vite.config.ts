import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const core = resolve(__dirname, '../../packages/core/src');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(__dirname, 'out/main'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'check-capture': resolve(__dirname, 'scripts/check-capture.ts'),
          'check-storage': resolve(__dirname, 'scripts/check-storage.ts'),
          'check-overlay': resolve(__dirname, 'scripts/check-overlay.ts'),
          'check-pipeline': resolve(__dirname, 'scripts/check-pipeline.ts'),
        },
        output: { entryFileNames: '[name].js', chunkFileNames: '[name].js' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(__dirname, 'out/preload'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          overlay: resolve(__dirname, 'src/preload/overlay.ts'),
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: { '@mimik/core': core, '@/core': core } },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          'check-storage': resolve(__dirname, 'src/renderer/check-storage.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
          'check-pipeline': resolve(__dirname, 'src/renderer/check-pipeline.html'),
        },
      },
    },
  },
});
