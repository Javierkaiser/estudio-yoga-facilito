import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseUrl } from './packages/testing/src/test-db-url';

const testDatabaseUrl = resolveTestDatabaseUrl();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    globalSetup: ['./vitest.global-setup.ts'],
    setupFiles: ['./packages/testing/src/fetch-guard.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
    },
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
