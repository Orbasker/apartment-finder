import { Bot, webhookCallback } from "grammy";
import { env } from "@/lib/env";
import { recordFeedback } from "@/feedback/store";
import { handleAgentMessage } from "@/agent/agent";
import { consumeLinkToken, getUserIdForChat } from "@/integrations/telegramLinks";
import { cancelLatestPatch, confirmLatestPatch } from "@/agent/patches";

let botInstance: Bot | undefined;

export function getBot(): Bot {
  if (botInstance) return botInstance;

  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }

  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const argToken = ctx.match?.trim() ?? "";

    if (!argToken) {
      const existing = await getUserIdForChat(chatId);
      if (existing) {
        await ctx.reply(
          "This chat is already linked. Ask me anything about listings — e.g. 'what did you find in florentin today?'",
        );
        return;
      }
      await ctx.reply(
        "This bot is private. Open the dashboard → Preferences → Connect Telegram, then tap the link there to finish authentication.",
      );
      return;
    }

    const result = await consumeLinkToken(argToken, chatId);
    if (!result.ok) {
      const msg =
        result.reason === "expired"
          ? "That link has expired. Generate a new one on the dashboard."
          : result.reason === "already_used"
            ? "That link was already used. Generate a new one if you need to re-link."
            : "Invalid link. Open Preferences → Connect Telegram on the dashboard to get a fresh one.";
      await ctx.reply(msg);
      return;
    }

    await ctx.reply(
      "Linked. You can now ask me about listings (e.g. 'show me 3-room under 7500 in florentin'), or reply /confirm or /cancel when I propose a preference change.",
    );
  });

  bot.command("ping", async (ctx) => {
    if (!(await requireLinkedUser(ctx))) return;
    await ctx.reply("pong");
  });

  bot.command("whoami", async (ctx) => {
    const userId = await requireLinkedUser(ctx);
    if (!userId) return;
    await ctx.reply(`Linked user: ${userId}`);
  });

  bot.command("unlink", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userId = await getUserIdForChat(chatId);
    if (!userId) {
      await ctx.reply("This chat isn't linked.");
      return;
    }
    const { unlinkUser } = await import("@/integrations/telegramLinks");
    await unlinkUser(userId);
    await ctx.reply("Unlinked. Generate a new link on the dashboard to reconnect.");
  });

  bot.command("confirm", async (ctx) => {
    const userId = await requireLinkedUser(ctx);
    if (!userId) return;
    const result = await confirmLatestPatch(userId);
    await ctx.reply(result);
  });

  bot.command("cancel", async (ctx) => {
    const userId = await requireLinkedUser(ctx);
    if (!userId) return;
    const result = await cancelLatestPatch(userId);
    await ctx.reply(result);
  });

  bot.on("callback_query:data", async (ctx) => {
    const chatId = String(ctx.chat?.id ?? "");
    const userId = chatId ? await getUserIdForChat(chatId) : null;
    if (!userId) {
      await ctx.answerCallbackQuery({ text: "Chat not linked." });
      return;
    }

    const data = ctx.callbackQuery.data;
    const match = /^fb:(up|down):(\d+)$/.exec(data);
    if (!match) {
      await ctx.answerCallbackQuery({ text: "Unknown action" });
      return;
    }
    const [, direction, idStr] = match;
    const listingId = Number(idStr);
    const rating = direction === "up" ? 1 : -1;
    await recordFeedback(userId, listingId, rating);

    await ctx.answerCallbackQuery({
      text: rating > 0 ? "Got it — 👍 recorded" : "Got it — 👎 recorded",
    });

    try {
      const original = ctx.callbackQuery.message?.text ?? "";
      await ctx.editMessageText(original + (rating > 0 ? "\n\n✓ 👍" : "\n\n✓ 👎"), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: false },
      });
    } catch {
      /* message too old / unchanged */
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) return next();
    const userId = await requireLinkedUser(ctx);
    if (!userId) return;
    try {
      const reply = await handleAgentMessage({
        userId,
        text: ctx.message.text,
      });
      await ctx.reply(reply, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
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

async function requireLinkedUser(ctx: {
  chat: { id: number };
  reply: (text: string) => Promise<unknown>;
}): Promise<string | null> {
  const chatId = String(ctx.chat.id);
  const userId = await getUserIdForChat(chatId);
  if (!userId) {
    await ctx.reply(
      "This chat isn't linked to a user yet. Open Preferences → Connect Telegram on the dashboard to finish auth.",
    );
    return null;
  }
  return userId;
}

export function telegramWebhookHandler() {
  const bot = getBot();
  return webhookCallback(bot, "std/http", {
    secretToken: env().TELEGRAM_WEBHOOK_SECRET,
    timeoutMilliseconds: 55_000,
    onTimeout: "return",
  });
}
