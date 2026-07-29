import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@content': fileURLToPath(new URL('./src/content', import.meta.url)),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    // Heavy seeded sweeps (economy / templates) can exceed 5s under parallel load.
    testTimeout: 20_000,
    // Cap parallelism so 100k-roll / template sweeps don't time out under load.
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json-summary'],
    },
  },
});
