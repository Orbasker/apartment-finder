import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().url(),

  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),

  /** Email auto-promoted to `role = 'admin'` on first sign-in. */
  ADMIN_EMAIL: z.string().email().optional(),

  AI_GATEWAY_API_KEY: z.string().optional(),

  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

  CRON_SECRET: z.string().optional(),

  APIFY_TOKEN: z.string().optional(),
  APIFY_WEBHOOK_SECRET: z.string().optional(),
  /** Public https origin for webhooks (Vercel URL, ngrok, etc.). Required for Apify when not using a public deployment URL. */
  APP_PUBLIC_ORIGIN: z.string().url().optional(),
  /** Semicolon-separated list of Facebook group URLs to scrape via Apify. */
  APIFY_GROUPS: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  GOOGLE_GEOCODING_API_KEY: z.string().optional(),

  YAD2_PROXY_URL: z.string().url().optional(),
  YAD2_PROXY_SECRET: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;
let envLoaded = false;

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

function ensureEnvLoaded(): void {
  if (envLoaded) return;

  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRootFromModule = path.resolve(moduleDir, "../../../..");
  const candidateFiles = [
    path.join(appDir, ".env.local"),
    path.join(appDir, ".env"),
    path.join(workspaceRootFromModule, ".env.local"),
    path.join(workspaceRootFromModule, ".env"),
  ];

  for (const filePath of candidateFiles) {
    loadEnvFile(filePath);
  }

  envLoaded = true;
}

export function env(): Env {
  if (cached) return cached;
  ensureEnvLoaded();
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  cached = parsed.data;
  return cached;
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value as NonNullable<Env[K]>;
}
