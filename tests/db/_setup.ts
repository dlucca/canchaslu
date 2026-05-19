import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '@/db/schema';

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error('DATABASE_URL_TEST is required for tests');
}

const client = postgres(testUrl, { max: 1, prepare: false });
export const testDb = drizzle(client, { schema });

export async function resetTestDb() {
  await client.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const result = spawnSync('pnpm', ['db:migrate'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DIRECT_URL: testUrl },
  });
  if (result.status !== 0) {
    throw new Error('migrate failed in test setup');
  }
}

beforeAll(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await client.end();
});
