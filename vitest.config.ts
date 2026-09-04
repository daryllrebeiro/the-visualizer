import 'dotenv/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env['DATABASE_URL'] ||
        'postgresql://visualizer:visualizer_test@localhost:5432/visualizer_test',
      SESSION_SECRET: 'test_session_secret_at_least_32_characters_long_123456',
      REDIS_URL: process.env['REDIS_URL'] || 'redis://localhost:6379',
      REDIS_PASSWORD: process.env['REDIS_PASSWORD'] || '',
      JWT_SECRET: 'test_jwt_secret_at_least_32_characters_long_123456',
      PORT: '3000',
    },
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
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
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
