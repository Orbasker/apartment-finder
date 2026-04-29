"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { telegramLinkTokens, userNotificationDestinations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";
import { env } from "@/lib/env";
import {
  NoActiveDestinationError,
  loadDestinations,
  upsertDestinations,
} from "@/notifications/destinations";
import { mintLinkToken } from "@/notifications/telegram-tokens";

export type SaveResult =
  | { ok: true }
  | { ok: false; error: "no_channel" | "telegram_unconfigured" | "telegram_not_linked" };

export async function saveNotificationsAction(formData: FormData): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const email = formData.get("email") === "on";
  const telegram = formData.get("telegram") === "on";
  if (!email && !telegram) {
    return { ok: false, error: "no_channel" };
  }

  const current = await loadDestinations(user.id);
  if (telegram && !current.telegramChatId) {
    // The form should not let users save with telegram=on but unlinked.
    // Surface a friendly error instead of silently saving an unusable state.
    return { ok: false, error: "telegram_not_linked" };
  }

  await upsertDestinations(user.id, { emailEnabled: email, telegramEnabled: telegram });
  revalidatePath("/notifications");
  return { ok: true };
}

export async function connectTelegramAction(): Promise<
  { ok: true; url: string } | { ok: false; error: "unconfigured" }
> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const botUsername = env().NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!botUsername) return { ok: false, error: "unconfigured" };
  const token = await mintLinkToken(user.id);
  return { ok: true, url: `https://t.me/${botUsername}?start=${token}` };
}

export async function disconnectTelegramAction(): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const db = getDb();
  const current = await loadDestinations(user.id);

  // If telegram was the only active channel, refuse - the user would have no
  // working destinations. They can disable telegram only after enabling email.
  const telegramActive = current.telegramEnabled && current.telegramChatId;
  if (telegramActive && !current.emailEnabled) {
    throw new NoActiveDestinationError();
  }

  await db
    .update(userNotificationDestinations)
    .set({
      telegramChatId: null,
      telegramLinkedAt: null,
      telegramEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(userNotificationDestinations.userId, user.id));

  // Also invalidate any unconsumed link tokens this user has minted.
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.userId, user.id));

  revalidatePath("/notifications");
  return { ok: true };
}
