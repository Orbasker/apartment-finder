#!/usr/bin/env bun
/**
 * Manual one-shot runner for the gov.il neighborhoods seed.
 *
 *   bun run --filter @apartment-finder/web seed:neighborhoods
 *
 * Honors NEIGHBORHOODS_CKAN_RESOURCE_ID from .env / .env.local. Fetches every
 * row from the configured CKAN datastore resource and upserts into the
 * `neighborhoods` table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const { runSeedNeighborhoodsJob } = await import("../src/jobs/seedNeighborhoods");

const result = await runSeedNeighborhoodsJob();
console.log(JSON.stringify(result.payload, null, 2));
process.exit(result.status === 200 && result.payload.ok ? 0 : 1);
