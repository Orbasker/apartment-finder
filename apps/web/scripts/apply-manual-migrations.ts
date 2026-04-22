import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
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

loadEnvFile(path.join(webRoot, ".env.local"));
loadEnvFile(path.join(webRoot, ".env"));
loadEnvFile(path.join(workspaceRoot, ".env.local"));
loadEnvFile(path.join(workspaceRoot, ".env"));

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "apply-manual-migrations: DIRECT_URL or DATABASE_URL is required.",
  );
  process.exit(1);
}

const drizzleDir = path.join(webRoot, "drizzle");
const files = fs
  .readdirSync(drizzleDir)
  .filter((name) => name.startsWith("manual_") && name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.log("apply-manual-migrations: no manual_*.sql files — skipping.");
  process.exit(0);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

try {
  for (const file of files) {
    const full = path.join(drizzleDir, file);
    const body = fs.readFileSync(full, "utf8");
    process.stdout.write(`apply-manual-migrations: running ${file}... `);
    await sql.unsafe(body);
    process.stdout.write("ok\n");
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\napply-manual-migrations: failed — ${message}`);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
