import { eq, sql } from "drizzle-orm";
import {
  PreferencesSchema,
  defaultPreferences,
  type Preferences,
} from "@apartment-finder/shared";
import { getDb } from "@/db";
import { preferences } from "@/db/schema";

const cache = new Map<string, Preferences>();
let adminUserIdCache: string | null | undefined;

export async function loadPreferences(userId: string): Promise<Preferences> {
  const cached = cache.get(userId);
  if (cached) return cached;

  const db = getDb();
  const rows = await db
    .select()
    .from(preferences)
    .where(eq(preferences.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    const defaults = defaultPreferences;
    await db
      .insert(preferences)
      .values({ userId, data: defaults })
      .onConflictDoNothing();
    cache.set(userId, defaults);
    return defaults;
  }

  const parsed = PreferencesSchema.safeParse(row.data);
  const value = parsed.success ? normalizePreferences(parsed.data) : defaultPreferences;
  cache.set(userId, value);
  return value;
}

export async function savePreferences(
  userId: string,
  next: Preferences,
): Promise<void> {
  const db = getDb();
  const parsed = normalizePreferences(PreferencesSchema.parse(next));
  await db
    .insert(preferences)
    .values({ userId, data: parsed, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: preferences.userId,
      set: { data: parsed, updatedAt: new Date() },
    });
  cache.set(userId, parsed);
}

export function clearPreferencesCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/**
 * Returns the admin user's id, used by global pipeline steps (AI judging,
 * Telegram alerts, agent chat) that run once per listing rather than per user.
 */
export async function getAdminUserId(): Promise<string | null> {
  if (adminUserIdCache !== undefined) return adminUserIdCache;
  const db = getDb();
  const rows = await db.execute<{ id: string }>(
    sql`SELECT id FROM auth.users
        WHERE (raw_app_meta_data->>'is_admin')::boolean = true
        ORDER BY created_at
        LIMIT 1`,
  );
  const id = (rows as unknown as { id: string }[])[0]?.id ?? null;
  adminUserIdCache = id;
  return id;
}

export function clearAdminUserIdCache(): void {
  adminUserIdCache = undefined;
}

export async function loadAdminPreferences(): Promise<Preferences> {
  const adminId = await getAdminUserId();
  if (!adminId) return defaultPreferences;
  return loadPreferences(adminId);
}

export async function saveAdminPreferences(next: Preferences): Promise<void> {
  const adminId = await getAdminUserId();
  if (!adminId) throw new Error("No admin user configured");
  await savePreferences(adminId, next);
}

export async function seedAlertEmailTargets(
  userId: string,
  userEmail: string | null | undefined,
): Promise<void> {
  const email = userEmail?.trim().toLowerCase();
  if (!email) return;

  const current = await loadPreferences(userId);
  const existing = getAlertEmailTargets(current);
  if (existing.length > 0) return;

  await savePreferences(userId, {
    ...current,
    alerts: {
      ...current.alerts,
      email: {
        ...current.alerts.email,
        targets: [email],
      },
    },
  });
}

export function getAlertEmailTargets(prefs: Preferences): string[] {
  const raw = [
    ...(prefs.alerts.email.targets ?? []),
    ...(prefs.alerts.email.to ? [prefs.alerts.email.to] : []),
  ];

  const seen = new Set<string>();
  const targets: string[] = [];
  for (const email of raw) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    targets.push(normalized);
  }
  return targets;
}

function normalizePreferences(prefs: Preferences): Preferences {
  const targets = getAlertEmailTargets(prefs);
  return {
    ...prefs,
    alerts: {
      ...prefs.alerts,
      email: {
        ...prefs.alerts.email,
        targets,
        to: targets[0],
      },
    },
  };
}
