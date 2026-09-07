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
      'apps/api/src/**/*.test.ts',
      'apps/ws-gateway/src/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/.next/**',
      'packages/**',
      'apps/web/**',
    ],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env['DATABASE_URL'] ||
        'postgresql://visualizer:visualizer_local@localhost:5432/visualizer_dev',
      SESSION_SECRET: 'test_session_secret_at_least_32_characters_long_123456',
      REDIS_URL: process.env['REDIS_URL'] || 'redis://localhost:6379',
      REDIS_PASSWORD: process.env['REDIS_PASSWORD'] || 'redis_local_secret',
      JWT_SECRET: 'test_jwt_secret_at_least_32_characters_long_123456',
      PORT: '3000',
    },
    // Single fork execution to prevent database connection collisions
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
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
