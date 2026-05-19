import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

async function main() {
  const sql = postgres(directUrl!, { max: 1, prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS __migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const migrationsDir = join(process.cwd(), 'src/db/migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    (await sql<{ filename: string }[]>`SELECT filename FROM __migrations`).map((r) => r.filename),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }
    const sqlText = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`→ applying ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);
      await tx`INSERT INTO __migrations (filename) VALUES (${file})`;
    });
    console.log(`✓ ${file}`);
  }

  await sql.end();
  console.log('migrations done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
