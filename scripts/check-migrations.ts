#!/usr/bin/env bun
/**
 * Fails if the committed drizzle migrations are out of sync with src/db/schema.ts.
 *
 * Runs `drizzle-kit generate` inside apps/web, then checks whether the
 * drizzle output directory has any uncommitted changes (new or modified files).
 * If so, the schema has drifted from the migrations and the dev forgot to run
 * `bun run db:generate` and commit the result.
 */
import { $ } from "bun";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const webDir = resolve(repoRoot, "apps/web");
const drizzleDir = resolve(webDir, "drizzle");

// drizzle.config.ts throws if DATABASE_URL is unset, but `generate` never
// connects — a dummy URL is enough.
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://ci:ci@localhost:5432/ci",
};

console.log("[db:check] running drizzle-kit generate...");
await $`bun run db:generate`.cwd(webDir).env(env);

if (!existsSync(drizzleDir)) {
  console.log("[db:check] no drizzle/ directory produced — nothing to check.");
  process.exit(0);
}

// Compare against HEAD so that locally-staged migrations (about to be
// committed) don't false-fail. In CI, HEAD is the commit under test, so any
// diff from generate means the schema drifted from the committed migrations.
const diff = await $`git diff HEAD --name-only -- ${drizzleDir}`.cwd(repoRoot).text();
const untracked = await $`git ls-files --others --exclude-standard -- ${drizzleDir}`
  .cwd(repoRoot)
  .text();

const drift = [diff, untracked].filter((s) => s.trim().length > 0).join("\n");

if (drift.trim().length > 0) {
  console.error("\n[db:check] schema drift detected. drizzle/ has changes not in HEAD:");
  console.error(drift);
  console.error("Run `bun run db:generate` locally and commit the generated migration files.");
  process.exit(1);
}

console.log("[db:check] migrations are in sync with schema.");
