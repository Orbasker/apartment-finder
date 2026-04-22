import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";

declare global {
  // eslint-disable-next-line no-var
  var __apartmentFinderDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  // eslint-disable-next-line no-var
  var __apartmentFinderSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const url = env().DATABASE_URL;
  const sql = postgres(url, {
    prepare: false,
    max: 1,
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
