import "server-only";

import postgres from "postgres";
import { env } from "../env";

/**
 * Single module-scoped Postgres client, reused across invocations (PERF-10);
 * never a connection per request. The browser never talks to the database
 * (SEC-03); the `server-only` guard enforces that this never reaches a client
 * bundle.
 *
 * Connection is Supabase's pooled (pgbouncer) URL. Transaction-mode pooling
 * does not support prepared statements, so `prepare: false`. TLS required.
 */
export const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  ssl: "require",
});
