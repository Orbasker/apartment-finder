import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

declare global {
  var __workerDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  var __workerSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const sql = postgres(env().DATABASE_URL, {
    prepare: false,
    max: 10,
    connect_timeout: 30,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connection: { statement_timeout: 25_000 },
  });
  return { sql, db: drizzle(sql, { schema }) };
}

export function getDb() {
  if (!globalThis.__workerDb) {
    const { sql, db } = createClient();
    globalThis.__workerSql = sql;
    globalThis.__workerDb = db;
  }
  return globalThis.__workerDb!;
}

export { schema };
