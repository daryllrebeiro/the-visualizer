import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL ||
        'postgresql://visualizer:visualizer_local@localhost:5432/visualizer_dev',
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      REDIS_PASSWORD: process.env.REDIS_PASSWORD || 'redis_local_secret',
      SESSION_SECRET:
        process.env.SESSION_SECRET || 'a_very_secure_and_long_32_byte_secret_key!',
      JWT_SECRET:
        process.env.JWT_SECRET || 'a_very_secure_and_long_32_byte_secret_key!',
      PORT: '3000',
    },
  },
});
