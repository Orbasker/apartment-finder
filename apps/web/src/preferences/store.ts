import { eq } from "drizzle-orm";
import {
  PreferencesSchema,
  defaultPreferences,
  type Preferences,
} from "@apartment-finder/shared";
import { getDb } from "@/db";
import { preferences } from "@/db/schema";

let cached: Preferences | undefined;

export async function loadPreferences(): Promise<Preferences> {
  if (cached) return cached;
  const db = getDb();
  const rows = await db.select().from(preferences).where(eq(preferences.id, 1)).limit(1);
  const row = rows[0];
  if (!row) {
    cached = defaultPreferences;
    return cached;
  }
  const parsed = PreferencesSchema.safeParse(row.data);
  cached = parsed.success ? parsed.data : defaultPreferences;
  return cached;
}

export function clearPreferencesCache(): void {
  cached = undefined;
}

export async function savePreferences(next: Preferences): Promise<void> {
  const db = getDb();
  const parsed = PreferencesSchema.parse(next);
  await db
    .insert(preferences)
    .values({ id: 1, data: parsed, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: preferences.id,
      set: { data: parsed, updatedAt: new Date() },
    });
  cached = parsed;
}
