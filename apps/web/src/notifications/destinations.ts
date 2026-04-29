import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  userNotificationDestinations,
  type NewUserNotificationDestinations,
  type UserNotificationDestinations,
} from "@/db/schema";

export type DestinationsRow = UserNotificationDestinations;

const DEFAULT_ROW = {
  emailEnabled: true,
  telegramEnabled: false,
  telegramChatId: null,
  telegramLinkedAt: null,
} as const;

/**
 * Read the user's destinations row, materializing a default row on first read
 * so callers always get back a usable shape. Legacy users (created before
 * APA-7) silently get email-only.
 */
export async function loadDestinations(userId: string): Promise<DestinationsRow> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(userNotificationDestinations)
    .where(eq(userNotificationDestinations.userId, userId))
    .limit(1);
  if (row) return row;

  const inserted = await db
    .insert(userNotificationDestinations)
    .values({ userId, ...DEFAULT_ROW })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  // Lost a race; re-read.
  const [again] = await db
    .select()
    .from(userNotificationDestinations)
    .where(eq(userNotificationDestinations.userId, userId))
    .limit(1);
  if (!again) throw new Error("destinations row missing after upsert");
  return again;
}

type DestinationsPatch = Partial<
  Pick<
    NewUserNotificationDestinations,
    "emailEnabled" | "telegramEnabled" | "telegramChatId" | "telegramLinkedAt"
  >
>;

export async function upsertDestinations(
  userId: string,
  patch: DestinationsPatch,
): Promise<DestinationsRow> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(userNotificationDestinations)
    .values({ userId, ...DEFAULT_ROW, ...patch, updatedAt: now })
    .onConflictDoUpdate({
      target: userNotificationDestinations.userId,
      set: { ...patch, updatedAt: now },
    })
    .returning();
  if (!row) throw new Error("upsertDestinations returned no row");
  return row;
}

/**
 * Returns the channels the user wants alerts on right now. Telegram is only
 * "active" if the user enabled it AND completed the link flow (we have a
 * chat ID).
 */
export function activeChannels(d: DestinationsRow): Array<"email" | "telegram"> {
  const out: Array<"email" | "telegram"> = [];
  if (d.emailEnabled) out.push("email");
  if (d.telegramEnabled && d.telegramChatId) out.push("telegram");
  return out;
}

export class NoActiveDestinationError extends Error {
  constructor() {
    super("at least one destination must be enabled");
    this.name = "NoActiveDestinationError";
  }
}
