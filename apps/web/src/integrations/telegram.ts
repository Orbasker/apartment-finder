import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import type { Judgment, NormalizedListing } from "@apartment-finder/shared";
import { env } from "@/lib/env";
import { loadPreferences, savePreferences } from "@/preferences/store";
import { recordFeedback } from "@/feedback/store";
import { handleAgentMessage } from "@/agent/agent";

let botInstance: Bot | undefined;

export function getBot(): Bot {
  if (botInstance) return botInstance;

  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }

  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    if (!(await enforceAllowedChat(ctx))) return;
    const chatId = String(ctx.chat.id);
    const prefs = await loadPreferences();
    if (!prefs.alerts.telegram.chatId) {
      await savePreferences({
        ...prefs,
        alerts: {
          ...prefs.alerts,
          telegram: { ...prefs.alerts.telegram, enabled: true, chatId },
        },
      });
      await ctx.reply(
        `Registered this chat for alerts.\nChat ID: ${chatId}\n\nI'll DM you when a matching apartment shows up. Ask me anything ("what did you find in florentin today?") and I'll search for you.`,
      );
    } else if (prefs.alerts.telegram.chatId === chatId) {
      await ctx.reply("Already registered. Ask me anything about listings.");
    } else {
      await ctx.reply(
        "A different chat is registered. Change via the dashboard.",
      );
    }
  });

  bot.command("ping", async (ctx) => {
    if (!(await enforceAllowedChat(ctx))) return;
    await ctx.reply("pong");
  });

  bot.command("whoami", async (ctx) => {
    if (!(await enforceAllowedChat(ctx))) return;
    await ctx.reply(
      `chat_id: ${ctx.chat.id}\nuser: ${ctx.from?.username ?? "—"}`,
    );
  });

  bot.command("confirm", async (ctx) => {
    if (!(await enforceAllowedChat(ctx))) return;
    const { confirmLatestPatch } = await import("@/agent/patches");
    const result = await confirmLatestPatch(String(ctx.chat.id));
    await ctx.reply(result);
  });

  bot.command("cancel", async (ctx) => {
    if (!(await enforceAllowedChat(ctx))) return;
    const { cancelLatestPatch } = await import("@/agent/patches");
    const result = await cancelLatestPatch(String(ctx.chat.id));
    await ctx.reply(result);
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const match = /^fb:(up|down):(\d+)$/.exec(data);
    if (!match) {
      await ctx.answerCallbackQuery({ text: "Unknown action" });
      return;
    }
    const [, direction, idStr] = match;
    const listingId = Number(idStr);
    const rating = direction === "up" ? 1 : -1;
    await recordFeedback(listingId, rating);

    await ctx.answerCallbackQuery({
      text: rating > 0 ? "Got it — 👍 recorded" : "Got it — 👎 recorded",
    });

    try {
      const original = ctx.callbackQuery.message?.text ?? "";
      await ctx.editMessageText(
        original + (rating > 0 ? "\n\n✓ 👍" : "\n\n✓ 👎"),
        { parse_mode: "HTML", link_preview_options: { is_disabled: false } },
      );
    } catch {
      /* message too old / unchanged */
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) return next();
    const chatId = String(ctx.chat.id);
    try {
      const reply = await handleAgentMessage({
        chatId,
        text: ctx.message.text,
      });
      await ctx.reply(reply, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    } catch (err) {
      console.error("agent failed:", err);
      await ctx.reply(
        "Sorry — I couldn't process that. Try again, or use /ping to check I'm alive.",
      );
    }
  });

  bot.catch((err) => {
    console.error("Telegram bot error:", err);
  });

  botInstance = bot;
  return bot;
}

async function enforceAllowedChat(ctx: {
  chat: { id: number };
  reply: (text: string) => Promise<unknown>;
}): Promise<boolean> {
  const prefs = await loadPreferences();
  const allowed =
    prefs.alerts.telegram.chatId ?? env().TELEGRAM_ALLOWED_CHAT_ID;
  if (!allowed) return true;
  if (String(ctx.chat.id) !== allowed) {
    await ctx.reply("This bot is private. Go away.");
    return false;
  }
  return true;
}

export function telegramWebhookHandler() {
  const bot = getBot();
  return webhookCallback(bot, "std/http", {
    secretToken: env().TELEGRAM_WEBHOOK_SECRET,
  });
}

type AlertInput = {
  listingId: number;
  listing: NormalizedListing;
  summary?: string;
  reason?: string;
  judgment?: Judgment;
};

export async function sendTelegramAlert(input: AlertInput): Promise<void> {
  const prefs = await loadPreferences();
  const chatId = prefs.alerts.telegram.chatId ?? env().TELEGRAM_ALLOWED_CHAT_ID;
  if (!prefs.alerts.telegram.enabled || !chatId) {
    console.warn("Telegram alerts disabled or no chat_id set — skipping");
    return;
  }

  const bot = getBot();
  const text = renderAlert(input);

  const keyboard = new InlineKeyboard()
    .text("👍", `fb:up:${input.listingId}`)
    .text("👎", `fb:down:${input.listingId}`);

  await bot.api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: false },
    reply_markup: keyboard,
  });
}

function renderAlert({ listing, summary, reason, judgment }: AlertInput): string {
  const priceStr =
    listing.priceNis != null
      ? `₪${listing.priceNis.toLocaleString("en-US")}`
      : "price ?";
  const roomsStr = listing.rooms != null ? `${listing.rooms}br` : "";
  const neighborhood = listing.neighborhood ?? "";
  const street = listing.street ?? "";

  const header =
    [neighborhood, street].filter(Boolean).join(" · ") ||
    (listing.title ?? "New listing");

  const lines = [
    `<b>${escapeHtml(header)}</b>`,
    [priceStr, roomsStr].filter(Boolean).join(" · "),
  ];

  if (judgment) {
    lines.push("", `<i>score ${judgment.score}</i>`);
  }
  if (summary) lines.push("", escapeHtml(summary));
  if (reason) lines.push("", `<i>${escapeHtml(reason)}</i>`);

  if (judgment && judgment.redFlags.length > 0) {
    lines.push("", `⚠︎ ${judgment.redFlags.slice(0, 3).map(escapeHtml).join(" · ")}`);
  }

  lines.push("", listing.url);
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
