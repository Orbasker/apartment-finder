import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { telegramLinkTokens } from "@/db/schema";

export const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Mint a fresh deep-link token for the given user. Always returns a new token; existing ones stay valid until they expire or are consumed. */
export async function mintLinkToken(userId: string): Promise<string> {
  const token = randomBytes(16).toString("base64url");
  const now = Date.now();
  await getDb()
    .insert(telegramLinkTokens)
    .values({
      token,
      userId,
      expiresAt: new Date(now + LINK_TOKEN_TTL_MS),
    });
  return token;
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_found" | "expired" | "already_consumed" };

/** Atomically consume a link token. Returns the userId on success. */
export async function consumeLinkToken(token: string): Promise<ConsumeResult> {
  const db = getDb();
  const now = new Date();

  const updated = await db
    .update(telegramLinkTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(telegramLinkTokens.token, token),
        isNull(telegramLinkTokens.consumedAt),
        gt(telegramLinkTokens.expiresAt, now),
      ),
    )
    .returning({ userId: telegramLinkTokens.userId });

  if (updated[0]) return { ok: true, userId: updated[0].userId };

  // Distinguish failure modes for better UX in the bot reply.
  const [row] = await db
    .select({
      consumedAt: telegramLinkTokens.consumedAt,
      expiresAt: telegramLinkTokens.expiresAt,
    })
    .from(telegramLinkTokens)
    .where(eq(telegramLinkTokens.token, token))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumedAt) return { ok: false, reason: "already_consumed" };
  return { ok: false, reason: "expired" };
}
