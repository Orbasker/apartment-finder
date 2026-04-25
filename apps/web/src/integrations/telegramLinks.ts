import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { telegramLinks, telegramLinkTokens } from "@/db/schema";

const TOKEN_TTL_MS = 15 * 60 * 1000;

export type ConsumeTokenResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_found" | "expired" | "already_used" };

export async function getUserIdForChat(chatId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ userId: telegramLinks.userId })
    .from(telegramLinks)
    .where(eq(telegramLinks.chatId, chatId))
    .limit(1);
  return row?.userId ?? null;
}

export async function getChatIdForUser(userId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ chatId: telegramLinks.chatId })
    .from(telegramLinks)
    .where(eq(telegramLinks.userId, userId))
    .limit(1);
  return row?.chatId ?? null;
}

export async function unlinkUser(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(telegramLinks).where(eq(telegramLinks.userId, userId));
}

export async function createLinkToken(userId: string): Promise<string> {
  const db = getDb();
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(telegramLinkTokens).values({ token, userId, expiresAt });
  return token;
}

export async function consumeLinkToken(token: string, chatId: string): Promise<ConsumeTokenResult> {
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .select()
    .from(telegramLinkTokens)
    .where(eq(telegramLinkTokens.token, token))
    .limit(1);

  if (!row) return { ok: false, reason: "not_found" };
  if (row.usedAt) return { ok: false, reason: "already_used" };
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  // Atomically mark the token used (guards against race).
  const claimed = await db
    .update(telegramLinkTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(telegramLinkTokens.token, token),
        isNull(telegramLinkTokens.usedAt),
        gt(telegramLinkTokens.expiresAt, now),
      ),
    )
    .returning({ userId: telegramLinkTokens.userId });

  if (claimed.length === 0) {
    return { ok: false, reason: "already_used" };
  }

  const userId = claimed[0]!.userId;

  // Clear any prior chat this user had linked, so each user has at most one chat.
  await db.delete(telegramLinks).where(eq(telegramLinks.userId, userId));

  await db
    .insert(telegramLinks)
    .values({ chatId, userId })
    .onConflictDoUpdate({
      target: telegramLinks.chatId,
      set: { userId, linkedAt: now },
    });

  return { ok: true, userId };
}
