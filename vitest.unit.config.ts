import 'dotenv/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
      'apps/web/src/**/*.test.tsx',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/.next/**',
      'apps/api/**',
      'apps/ws-gateway/**',
    ],
    env: {
      NODE_ENV: 'test',
    },
    // High-concurrency worker threads for pure deterministic logic
    pool: 'threads',
    reporter: process.env['CI'] ? 'verbose' : 'default',
  },
  resolve: {
    alias: {
      '@the-visualizer/simulation': resolve(__dirname, './packages/simulation/src/index.ts'),
      '@the-visualizer/contracts': resolve(__dirname, './packages/contracts/src/index.ts'),
      '@the-visualizer/config': resolve(__dirname, './packages/config/src/index.ts'),
      '@the-visualizer/logging': resolve(__dirname, './packages/logging/src/index.ts'),
      '@the-visualizer/test-utils': resolve(__dirname, './packages/test-utils/src/index.ts'),
    },
  },
});
