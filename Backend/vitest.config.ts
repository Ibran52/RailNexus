import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test_secret_for_railnexus_testing_1234567890',
      MONGO_URI: 'mongodb://127.0.0.1:27017/railnexus_test',
      PORT: '5001',
      BRAIN_SERVICE_URL: 'http://localhost:8000',
    },
  },
});
