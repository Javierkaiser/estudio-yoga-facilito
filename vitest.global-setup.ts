import 'dotenv/config';
import { dropDatabase, ensureDatabase } from './packages/testing/src/db';
import { resolveTestDatabaseUrl } from './packages/testing/src/test-db-url';

export default async function setup(): Promise<() => Promise<void>> {
  const url = resolveTestDatabaseUrl();
  await ensureDatabase(url);

  return async () => {
    if (process.env.KEEP_TEST_DB !== '1') {
      await dropDatabase(url);
    }
  };
}
