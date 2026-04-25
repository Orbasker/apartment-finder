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

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (key === "" || process.env[key] !== undefined) continue;

    let value = line.slice(separatorIndex + 1).trim();
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
  console.error("apply-better-auth-uuid-defaults: DIRECT_URL or DATABASE_URL is required.");
  process.exit(1);
}

const migrationPath = path.join(webRoot, "drizzle", "manual_better_auth_uuid_defaults.sql");
const migration = fs.readFileSync(migrationPath, "utf8");
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

try {
  await sql.unsafe(migration);

  const defaults = await sql<
    {
      table_name: string;
      column_default: string | null;
    }[]
  >`
    select table_name, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('user', 'session', 'account', 'verification')
      and column_name = 'id'
    order by table_name
  `;

  for (const row of defaults) {
    console.log(`${row.table_name}.id default: ${row.column_default ?? "<missing>"}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
