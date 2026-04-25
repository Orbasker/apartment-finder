import { getDb } from "@/db";
import { feedback } from "@/db/schema";

export async function recordFeedback(
  userId: string,
  canonicalId: number,
  rating: 1 | -1,
  note?: string,
): Promise<void> {
  const db = getDb();
  await db
    .insert(feedback)
    .values({ userId, canonicalId, rating, note: note ?? null })
    .onConflictDoUpdate({
      target: [feedback.canonicalId, feedback.userId],
      set: { rating, note: note ?? null, createdAt: new Date() },
    });
}
