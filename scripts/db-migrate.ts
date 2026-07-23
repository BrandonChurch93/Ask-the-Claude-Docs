import { runMigrations } from "../lib/db/migrator";
import { sql } from "../lib/db/client";

/**
 * CLI entrypoint for the migration runner (logic lives in lib/db/migrator.ts
 * per ENG-03). Run: `npm run db:migrate` (loads .env.local and neutralizes the
 * server-only guard for this CLI context).
 */
async function main() {
  const { applied, skipped } = await runMigrations();
  for (const f of skipped) console.log(`skip   ${f}`);
  for (const f of applied) console.log(`apply  ${f}`);
  console.log(
    `done: ${applied.length} applied, ${skipped.length} already present.`,
  );
  await sql.end();
}

main().catch(async (err) => {
  console.error("migration failed:", err instanceof Error ? err.message : err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
