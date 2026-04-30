import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { userNotificationDestinations } from "@/db/schema";
import { env } from "@/lib/env";
import { withApiLog } from "@/lib/log";
import { consumeLinkToken } from "@/notifications/telegram-tokens";
import { sendLinkConfirmation, sendLinkFailure } from "@/ingestion/telegram";
import { upsertDestinations } from "@/notifications/destinations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Minimal subset of the Telegram Update payload - we only react to text
// messages whose contents start with "/start". Everything else is ignored.
const TelegramUpdate = z
  .object({
    update_id: z.number(),
    message: z
      .object({
        message_id: z.number(),
        chat: z.object({
          id: z.number(),
          type: z.string().optional(),
          username: z.string().optional(),
        }),
        from: z
          .object({
            id: z.number(),
            username: z.string().optional(),
            language_code: z.string().optional(),
          })
          .optional(),
        text: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export async function POST(req: Request): Promise<Response> {
  return withApiLog("webhooks:telegram", req, async (log) => {
    const expectedSecret = env().TELEGRAM_WEBHOOK_SECRET;
    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "TELEGRAM_WEBHOOK_SECRET not set" },
        { status: 500 },
      );
    }
    const givenSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (givenSecret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = TelegramUpdate.safeParse(json);
    if (!parsed.success) {
      log.warn("invalid telegram update", { issues: JSON.stringify(parsed.error.flatten()) });
      // Telegram retries on non-2xx; ack and move on.
      return NextResponse.json({ ok: true, ignored: "invalid_payload" });
    }

    const message = parsed.data.message;
    const text = message?.text ?? "";
    const chatId = message?.chat.id;
    if (!message || chatId === undefined || !text.startsWith("/start")) {
      return NextResponse.json({ ok: true, ignored: "not_start" });
    }

    const chatIdStr = String(chatId);
    const tokenArg = text.slice("/start".length).trim();
    if (!tokenArg) {
      await sendLinkFailure(chatIdStr, "missing");
      return NextResponse.json({ ok: true, action: "missing_token" });
    }

    const consumed = await consumeLinkToken(tokenArg);
    if (!consumed.ok) {
      log.warn("link token rejected", { reason: consumed.reason });
      await sendLinkFailure(chatIdStr, consumed.reason);
      return NextResponse.json({ ok: true, action: "rejected", reason: consumed.reason });
    }

    // Bind the chat ID to the user's destinations row, also flipping telegram on.
    const db = getDb();
    const now = new Date();

    // If a different user is already linked to this chat, clear them out first
    // so the unique index doesn't fire. This handles the rare "two accounts on
    // one Telegram" case - last-write-wins.
    await db
      .update(userNotificationDestinations)
      .set({ telegramChatId: null, telegramLinkedAt: null, telegramEnabled: false, updatedAt: now })
      .where(eq(userNotificationDestinations.telegramChatId, chatIdStr));

    await upsertDestinations(consumed.userId, {
      telegramChatId: chatIdStr,
      telegramLinkedAt: now,
      telegramEnabled: true,
    });

    log.info("telegram linked", { userId: consumed.userId, chatId: chatIdStr });
    await sendLinkConfirmation(chatIdStr);

    return NextResponse.json({ ok: true, action: "linked" });
  });
}
