import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";

declare global {
  var __apartmentFinderDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  var __apartmentFinderSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const url = env().DATABASE_URL;
  const sql = postgres(url, {
    prepare: false,
    // Allow a single lambda's Promise.all fan-out to run in parallel instead
    // of serializing through one socket. Pages do ~5–20 queries per render;
    // max:1 made every "parallel" query effectively sequential.
    max: 10,
    connect_timeout: 30,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connection: {
      statement_timeout: 25_000,
    },
  });
  return { sql, db: drizzle(sql, { schema }) };
}

export function getDb() {
  if (!globalThis.__apartmentFinderDb) {
    const { sql, db } = createClient();
    globalThis.__apartmentFinderSql = sql;
    globalThis.__apartmentFinderDb = db;
  }
  return globalThis.__apartmentFinderDb!;
}

export { schema };
