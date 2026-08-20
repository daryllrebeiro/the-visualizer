import 'dotenv/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        '**/types.ts',
        '**/node_modules/**',
        '**/dist/**',
      ],
      thresholds: {
        // packages/simulation and packages/contracts must have 100% coverage
        // enforced per-package in their own vitest configs
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    // Run tests in worker threads for isolation
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
    reporter: process.env['CI'] ? 'verbose' : 'default',
    outputFile: {
      junit: './test-results/junit.xml',
    },
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
