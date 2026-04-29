#!/usr/bin/env bun
/**
 * One-shot helper to register the Telegram webhook URL with the bot.
 *
 *   bun apps/web/scripts/setup-telegram-webhook.ts
 *
 * Required env (read from .env or the shell):
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET
 *   APP_PUBLIC_ORIGIN  (e.g. https://apartment-finder.vercel.app)
 *
 * Re-run any time those values change. Safe to run repeatedly.
 */
import fs from "node:fs";
import path from "node:path";
import { Bot } from "grammy";

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

const repoRoot = path.resolve(import.meta.dir, "../../..");
loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(repoRoot, ".env.local"));

function require_(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`Missing required env: ${key}`);
    process.exit(1);
  }
  return v;
}

const token = require_("TELEGRAM_BOT_TOKEN");
const secret = require_("TELEGRAM_WEBHOOK_SECRET");
const origin = require_("APP_PUBLIC_ORIGIN").replace(/\/$/, "");
const url = `${origin}/api/webhooks/telegram`;

const bot = new Bot(token);

console.log(`Registering Telegram webhook → ${url}`);
await bot.api.setWebhook(url, {
  secret_token: secret,
  drop_pending_updates: true,
  allowed_updates: ["message"],
});
const info = await bot.api.getWebhookInfo();
console.log("Webhook info:", JSON.stringify(info, null, 2));

const me = await bot.api.getMe();
console.log(`Bot ready: @${me.username} (${me.id})`);
