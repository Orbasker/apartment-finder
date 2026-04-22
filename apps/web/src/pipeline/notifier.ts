import { and, eq } from "drizzle-orm";
import type { Judgment, NormalizedListing } from "@apartment-finder/shared";
import { getDb } from "@/db";
import { sentAlerts } from "@/db/schema";
import { sendTelegramAlert } from "@/integrations/telegram";
import { sendEmailAlert, isResendConfigured } from "@/integrations/resend";

export type NotifyOptions = {
  listingId: number;
  listing: NormalizedListing;
  summary?: string;
  reason?: string;
  judgment?: Judgment;
};

export async function notifyListing(opts: NotifyOptions): Promise<void> {
  await Promise.all([
    notifyChannel("telegram", opts, () => sendTelegramAlert(opts)),
    isResendConfigured()
      ? notifyChannel("email", opts, () => sendEmailAlert(opts))
      : Promise.resolve(),
  ]);
}

async function notifyChannel(
  channel: "telegram" | "email",
  opts: NotifyOptions,
  send: () => Promise<void>,
): Promise<void> {
  const db = getDb();

  const existing = await db
    .select()
    .from(sentAlerts)
    .where(and(eq(sentAlerts.listingId, opts.listingId), eq(sentAlerts.channel, channel)))
    .limit(1);

  if (existing.length > 0) return;

  try {
    await send();
  } catch (err) {
    console.error(`send ${channel} alert failed:`, err);
    return;
  }

  await db
    .insert(sentAlerts)
    .values({ listingId: opts.listingId, channel })
    .onConflictDoNothing();
}
