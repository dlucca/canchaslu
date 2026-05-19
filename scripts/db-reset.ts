import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

async function dropSchema() {
  const sql = postgres(directUrl!, { max: 1, prepare: false });
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await sql.end();
}

function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

(async () => {
  console.log('db:reset → DROP SCHEMA public CASCADE');
  await dropSchema();
  console.log('db:reset → migrate');
  run('pnpm', ['db:migrate']);
  console.log('db:reset → seed');
  run('pnpm', ['db:seed']);
  console.log('db:reset done');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
