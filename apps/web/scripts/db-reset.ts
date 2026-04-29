#!/usr/bin/env bun
/**
 * Drops the public schema and re-applies all migrations programmatically.
 *
 * Use this when drizzle-kit push gets stuck on rename prompts because the
 * live DB still has tables from the pre-rebuild schema. After this runs,
 * the DB matches `apps/web/src/db/schema.ts` exactly.
 *
 *   bun run --filter @apartment-finder/web db:reset
 *
 * Set `FORCE=1` to skip the confirmation countdown.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const workspaceRoot = path.resolve(webRoot, "../..");

for (const candidate of [
  path.join(webRoot, ".env.local"),
  path.join(webRoot, ".env"),
  path.join(workspaceRoot, ".env.local"),
  path.join(workspaceRoot, ".env"),
]) {
  loadEnvFile(candidate);
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("db-reset: DIRECT_URL or DATABASE_URL must be set.");
  process.exit(1);
}

const force = process.env.FORCE === "1";
if (!force) {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "(unparseable url)";
    }
  })();
  console.error(`\n⚠️  About to DROP SCHEMA public CASCADE on ${host}`);
  console.error("    Every table in the public schema will be deleted.");
  console.error("    Press Ctrl-C in the next 3 seconds to abort.\n");
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

try {
  console.log("→ dropping public + drizzle schemas");
  // Also drop the `drizzle` schema, which holds drizzle's `__drizzle_migrations`
  // bookkeeping table. Without this, a partial reset would convince the migrator
  // that earlier migrations had already run and it would skip them, leaving the
  // public schema empty when later migrations tried to ALTER non-existent tables.
  await sql.unsafe(`
    DROP SCHEMA IF EXISTS drizzle CASCADE;
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);

  console.log("→ applying migrations from drizzle/");
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: path.join(webRoot, "drizzle") });

  console.log("✓ schema reset complete");
} catch (err) {
  console.error("✗ db-reset failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
