#!/usr/bin/env bun
/**
 * Registers the Telegram webhook for the deployed app and prints the resulting
 * webhook status.
 *
 * Usage:
 *   bun run telegram:webhook --url https://your-prod-domain.vercel.app
 *   bun run telegram:webhook --url https://your-prod-domain.vercel.app/api/telegram/webhook
 *
 * Required environment variables:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET
 */

type WebhookInfo = {
  ok: boolean;
  result?: {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
    max_connections?: number;
    ip_address?: string;
  };
  description?: string;
};

const WEBHOOK_PATH = "/api/telegram/webhook";

function printUsage(): void {
  console.log(`Register the Telegram webhook for the deployed app.

Usage:
  bun run telegram:webhook --url https://your-prod-domain.vercel.app
  bun run telegram:webhook --url https://your-prod-domain.vercel.app/api/telegram/webhook

Environment:
  TELEGRAM_BOT_TOKEN
  TELEGRAM_WEBHOOK_SECRET
`);
}

function readArg(name: string): string | undefined {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];

  return undefined;
}

function normalizeWebhookUrl(raw: string): string {
  const url = new URL(raw);
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = WEBHOOK_PATH;
  } else if (!url.pathname.endsWith(WEBHOOK_PATH)) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}${WEBHOOK_PATH}`;
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function telegramApi<T>(token: string, method: string, body?: URLSearchParams): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    body,
  });

  if (!response.ok) {
    throw new Error(`Telegram API ${method} failed with HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function renderWebhookInfo(info: WebhookInfo["result"] | undefined): void {
  if (!info) return;

  console.log(`Webhook URL: ${info.url || "(empty)"}`);
  console.log(`Pending updates: ${info.pending_update_count}`);
  if (info.last_error_message) {
    const date = info.last_error_date
      ? new Date(info.last_error_date * 1000).toISOString()
      : "unknown";
    console.log(`Last error: ${info.last_error_message} (${date})`);
  } else {
    console.log("Last error: none");
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const rawUrl = readArg("--url") ?? process.env.TELEGRAM_WEBHOOK_URL;

  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }
  if (!secret) {
    throw new Error("Missing TELEGRAM_WEBHOOK_SECRET");
  }
  if (!rawUrl) {
    throw new Error("Pass --url or set TELEGRAM_WEBHOOK_URL");
  }

  const webhookUrl = normalizeWebhookUrl(rawUrl);

  console.log(`Registering Telegram webhook: ${webhookUrl}`);

  const setResult = await telegramApi<{ ok: boolean; result: boolean; description?: string }>(
    token,
    "setWebhook",
    new URLSearchParams({
      url: webhookUrl,
      secret_token: secret,
    }),
  );

  if (!setResult.ok || !setResult.result) {
    throw new Error(setResult.description ?? "setWebhook failed");
  }

  const info = await telegramApi<WebhookInfo>(token, "getWebhookInfo");
  if (!info.ok) {
    throw new Error(info.description ?? "getWebhookInfo failed");
  }

  console.log("Webhook registered.");
  renderWebhookInfo(info.result);
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
