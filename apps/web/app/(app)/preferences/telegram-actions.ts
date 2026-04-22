"use server";

import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  createLinkToken,
  getChatIdForUser,
  unlinkUser,
} from "@/integrations/telegramLinks";

export type LinkStatus =
  | { linked: true; chatId: string }
  | { linked: false };

export type CreateLinkResult =
  | {
      ok: true;
      deepLink: string | null;
      token: string;
      botUsername: string | null;
    }
  | { ok: false; error: string };

export async function getTelegramLinkStatus(): Promise<LinkStatus> {
  const user = await getCurrentUser();
  if (!user) return { linked: false };
  const chatId = await getChatIdForUser(user.id);
  return chatId ? { linked: true, chatId } : { linked: false };
}

export async function createTelegramLinkAction(): Promise<CreateLinkResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const token = await createLinkToken(user.id);
  const botUsername =
    env().NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ??
    env().TELEGRAM_BOT_USERNAME ??
    null;

  const deepLink = botUsername ? `https://t.me/${botUsername}?start=${token}` : null;
  return { ok: true, deepLink, token, botUsername };
}

export async function unlinkTelegramAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  await unlinkUser(user.id);
  revalidatePath("/preferences");
}
