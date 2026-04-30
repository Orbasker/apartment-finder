import { z } from "zod";

const EnvSchema = z.object({
  REDIS_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  AI_GATEWAY_API_KEY: z.string().min(1),
  GOOGLE_GEOCODING_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  APIFY_TOKEN: z.string().optional(),
  APIFY_GROUPS: z.string().optional(),
  YAD2_PROXY_URL: z.string().url().optional(),
  YAD2_PROXY_SECRET: z.string().optional(),
  APP_PUBLIC_ORIGIN: z.string().url(),
  COLLECTOR_WEBHOOK_SECRET: z.string().min(32),
  BLOB_READ_WRITE_TOKEN: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().optional(),
  LOG_DEBUG: z.string().optional(),
});

export type WorkerEnv = z.infer<typeof EnvSchema>;

let cached: WorkerEnv | undefined;

export function env(): WorkerEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "Invalid environment variables:",
      JSON.stringify(parsed.error.flatten().fieldErrors),
    );
    throw new Error("Invalid environment variables");
  }
  cached = parsed.data;
  return cached;
}

export function requireEnv<K extends keyof WorkerEnv>(key: K): NonNullable<WorkerEnv[K]> {
  const value = env()[key];
  if (value === undefined || value === null || (typeof value === "string" && value === "")) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return value as NonNullable<WorkerEnv[K]>;
}
