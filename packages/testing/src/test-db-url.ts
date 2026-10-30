import { DEFAULT_TEST_DATABASE_URL } from '../../shared/src/env';

export { DEFAULT_TEST_DATABASE_URL };

export function resolveTestDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  return source.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
}
