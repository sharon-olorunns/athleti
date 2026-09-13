import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // The progression engine and timer maths are pure functions; no DOM needed.
    // The seed-loader tests bring their own IndexedDB via fake-indexeddb.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
