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
  cached = parsed.success ? normalizePreferences(parsed.data) : defaultPreferences;
  return cached;
}

export function clearPreferencesCache(): void {
  cached = undefined;
}

export async function savePreferences(next: Preferences): Promise<void> {
  const db = getDb();
  const parsed = normalizePreferences(PreferencesSchema.parse(next));
  await db
    .insert(preferences)
    .values({ id: 1, data: parsed, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: preferences.id,
      set: { data: parsed, updatedAt: new Date() },
    });
  cached = parsed;
}

export async function seedAlertEmailTargets(userEmail: string | null | undefined): Promise<void> {
  const email = userEmail?.trim().toLowerCase();
  if (!email) return;

  const current = await loadPreferences();
  const existing = getAlertEmailTargets(current);
  if (existing.length > 0) return;

  await savePreferences({
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
