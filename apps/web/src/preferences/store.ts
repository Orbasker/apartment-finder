import { cache as reactCache } from "react";
import { eq, sql } from "drizzle-orm";
import { PreferencesSchema, defaultPreferences, type Preferences } from "@apartment-finder/shared";
import { getDb } from "@/db";
import { preferences } from "@/db/schema";
import { createLogger, errorMessage } from "@/lib/log";

const log = createLogger("preferences");

let adminUserIdCache: string | null | undefined;

// NOTE: deliberately no cross-request cache here. A module-level Map persists
// per lambda instance, so a Save on lambda A does not invalidate stale entries
// on lambda B, and refreshes routed to B would render old prefs even though
// Postgres has the new ones. The pkey lookup below is ~1-2ms; that's cheap
// enough that correctness wins. `reactCache` still dedupes within one render.
async function loadPreferencesUncached(userId: string): Promise<Preferences> {
  const startedAt = Date.now();
  const db = getDb();
  const rows = await db.select().from(preferences).where(eq(preferences.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) {
    const defaults = defaultPreferences;
    await db.insert(preferences).values({ userId, data: defaults }).onConflictDoNothing();
    log.info("seeded defaults", {
      user: userId,
      durationMs: Date.now() - startedAt,
    });
    return defaults;
  }

  const parsed = PreferencesSchema.safeParse(row.data);
  if (!parsed.success) {
    log.warn("parse failed, using defaults", {
      user: userId,
      issues: parsed.error.issues.length,
      durationMs: Date.now() - startedAt,
    });
    return defaultPreferences;
  }
  return normalizePreferences(parsed.data);
}

export const loadPreferences = reactCache(loadPreferencesUncached);

export async function savePreferences(userId: string, next: Preferences): Promise<void> {
  const startedAt = Date.now();
  const db = getDb();
  const parsed = normalizePreferences(next);
  try {
    await db
      .insert(preferences)
      .values({ userId, data: parsed, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: preferences.userId,
        set: { data: parsed, updatedAt: new Date() },
      });
    log.info("saved", {
      user: userId,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    log.error("save failed", {
      user: userId,
      durationMs: Date.now() - startedAt,
      error: errorMessage(err),
    });
    throw err;
  }
}

/**
 * Returns the admin user's id, used by global pipeline steps (AI judging,
 * Telegram alerts, agent chat) that run once per listing rather than per user.
 */
export async function getAdminUserId(): Promise<string | null> {
  if (adminUserIdCache !== undefined) return adminUserIdCache;
  const db = getDb();
  const rows = await db.execute<{ id: string }>(
    sql`SELECT id FROM "user"
        WHERE role = 'admin'
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

export async function getUserAuthEmail(userId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.execute<{ email: string | null }>(
    sql`SELECT email FROM "user" WHERE id = ${userId} LIMIT 1`,
  );
  const email = (rows as unknown as { email: string | null }[])[0]?.email;
  return email?.trim().toLowerCase() || null;
}

/**
 * Returns the email recipients for a given user's alerts.
 * Falls back to the user's account email when no explicit targets are
 * configured, so new signups get alerts without touching preferences.
 */
export async function getUserAlertRecipients(
  userId: string,
  prefs: Preferences,
): Promise<string[]> {
  const configured = getAlertEmailTargets(prefs);
  if (configured.length > 0) return configured;
  const authEmail = await getUserAuthEmail(userId);
  return authEmail ? [authEmail] : [];
}

/**
 * Returns users who have opted into email alerts in their preferences.
 * Crons fan out over this list so each user gets alerts against their own rules.
 */
export async function getActiveEmailAlertUsers(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ userId: preferences.userId, data: preferences.data })
    .from(preferences);
  return rows
    .filter((r) => {
      const parsed = PreferencesSchema.safeParse(r.data);
      return parsed.success && parsed.data.alerts.email.enabled;
    })
    .map((r) => r.userId);
}

export async function getActiveTopPicksUsers(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ userId: preferences.userId, data: preferences.data })
    .from(preferences);
  return rows
    .filter((r) => {
      const parsed = PreferencesSchema.safeParse(r.data);
      return parsed.success && parsed.data.alerts.email.topPicksEnabled;
    })
    .map((r) => r.userId);
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
