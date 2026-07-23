import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "./client";

/**
 * Migration runner (ENG-03: all SQL lives in lib/db/; migrations are ordered
 * .sql files in db/migrations/). Each file runs once, inside a transaction, and
 * is recorded in `schema_migrations`; re-running applies only new files
 * (idempotent). A failure rolls back that file's transaction and rejects so the
 * caller can exit non-zero (loud failure).
 */
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "db",
  "migrations",
);

export async function runMigrations(): Promise<{
  applied: string[];
  skipped: string[];
}> {
  await sql`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const appliedRows = await sql<
    { filename: string }[]
  >`select filename from schema_migrations`;
  const already = new Set(appliedRows.map((r) => r.filename));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (already.has(file)) {
      skipped.push(file);
      continue;
    }
    const contents = readFileSync(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`insert into schema_migrations (filename) values (${file})`;
    });
    applied.push(file);
  }

  return { applied, skipped };
}
