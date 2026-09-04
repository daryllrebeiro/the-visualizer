import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test_db',
      REDIS_URL: 'redis://localhost:6379',
      SESSION_SECRET: 'a_very_secure_and_long_32_byte_secret_key!',
      PORT: '3000',
    },
  },
});
