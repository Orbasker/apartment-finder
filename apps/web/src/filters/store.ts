import { and, eq } from "drizzle-orm";
import {
  APARTMENT_ATTRIBUTE_KEYS,
  type ApartmentAttributeKey,
  type AttributeRequirement,
  type Filters,
} from "@apartment-finder/shared";
import { getDb } from "@/db";
import { userFilterAttributes, userFilterTexts, userFilters } from "@/db/schema";
import { embedText } from "@/ingestion/embed";
import { createLogger, errorMessage } from "@/lib/log";

const log = createLogger("filters:store");

export type FilterTextKind = "wish" | "dealbreaker";

export type StoredFilters = Filters & {
  onboardedAt: Date | null;
};

export async function loadFilters(userId: string): Promise<StoredFilters> {
  const db = getDb();
  const [row] = await db.select().from(userFilters).where(eq(userFilters.userId, userId)).limit(1);
  const attrs = await db
    .select({ key: userFilterAttributes.key, requirement: userFilterAttributes.requirement })
    .from(userFilterAttributes)
    .where(eq(userFilterAttributes.userId, userId));

  if (!row) {
    return {
      priceMinNis: null,
      priceMaxNis: null,
      roomsMin: null,
      roomsMax: null,
      sqmMin: null,
      sqmMax: null,
      allowedNeighborhoods: [],
      blockedNeighborhoods: [],
      wishes: [],
      dealbreakers: [],
      attributes: [],
      strictUnknowns: true,
      dailyAlertCap: 20,
      maxAgeHours: 48,
      isActive: true,
      onboardedAt: null,
    };
  }
  return {
    priceMinNis: row.priceMinNis,
    priceMaxNis: row.priceMaxNis,
    roomsMin: row.roomsMin,
    roomsMax: row.roomsMax,
    sqmMin: row.sqmMin,
    sqmMax: row.sqmMax,
    allowedNeighborhoods: row.allowedNeighborhoods ?? [],
    blockedNeighborhoods: row.blockedNeighborhoods ?? [],
    wishes: row.wishes ?? [],
    dealbreakers: row.dealbreakers ?? [],
    attributes: attrs,
    strictUnknowns: row.strictUnknowns,
    dailyAlertCap: row.dailyAlertCap,
    maxAgeHours: row.maxAgeHours,
    isActive: row.isActive,
    onboardedAt: row.onboardedAt,
  };
}

type ScalarPatch = Partial<{
  priceMinNis: number | null;
  priceMaxNis: number | null;
  roomsMin: number | null;
  roomsMax: number | null;
  sqmMin: number | null;
  sqmMax: number | null;
  allowedNeighborhoods: string[];
  blockedNeighborhoods: string[];
  wishes: string[];
  dealbreakers: string[];
  strictUnknowns: boolean;
  dailyAlertCap: number;
  maxAgeHours: number;
  isActive: boolean;
  onboardedAt: Date | null;
}>;

export async function upsertFilters(userId: string, patch: ScalarPatch): Promise<void> {
  const db = getDb();
  await db
    .insert(userFilters)
    .values({ userId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userFilters.userId,
      set: { ...patch, updatedAt: new Date() },
    });
}

export async function setAttribute(
  userId: string,
  key: ApartmentAttributeKey,
  requirement: AttributeRequirement,
): Promise<void> {
  const db = getDb();
  if (requirement === "dont_care") {
    await db
      .delete(userFilterAttributes)
      .where(and(eq(userFilterAttributes.userId, userId), eq(userFilterAttributes.key, key)));
    return;
  }
  await db
    .insert(userFilterAttributes)
    .values({ userId, key, requirement })
    .onConflictDoUpdate({
      target: [userFilterAttributes.userId, userFilterAttributes.key],
      set: { requirement },
    });
}

export async function replaceAttributes(
  userId: string,
  attributes: Array<{ key: ApartmentAttributeKey; requirement: AttributeRequirement }>,
): Promise<void> {
  const db = getDb();
  await db.delete(userFilterAttributes).where(eq(userFilterAttributes.userId, userId));
  const rows = attributes.filter((a) => a.requirement !== "dont_care");
  if (rows.length === 0) return;
  await db.insert(userFilterAttributes).values(rows.map((a) => ({ userId, ...a })));
}

export async function addText(userId: string, kind: FilterTextKind, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const db = getDb();

  // Append to the array column on user_filters (display).
  const filters = await loadFilters(userId);
  const list = kind === "wish" ? filters.wishes : filters.dealbreakers;
  if (list.includes(trimmed)) return;
  await upsertFilters(
    userId,
    kind === "wish" ? { wishes: [...list, trimmed] } : { dealbreakers: [...list, trimmed] },
  );

  // Embed lazily; matcher needs this for dealbreaker gating.
  let embedding: number[] | null = null;
  try {
    embedding = await embedText(trimmed);
  } catch (err) {
    log.warn("embed text failed (continuing without embedding)", {
      kind,
      error: errorMessage(err),
    });
  }
  await db.insert(userFilterTexts).values({ userId, kind, text: trimmed, embedding });
}

export async function removeText(
  userId: string,
  kind: FilterTextKind,
  text: string,
): Promise<void> {
  const db = getDb();
  const filters = await loadFilters(userId);
  const list = kind === "wish" ? filters.wishes : filters.dealbreakers;
  const next = list.filter((t) => t !== text);
  await upsertFilters(userId, kind === "wish" ? { wishes: next } : { dealbreakers: next });
  await db
    .delete(userFilterTexts)
    .where(
      and(
        eq(userFilterTexts.userId, userId),
        eq(userFilterTexts.kind, kind),
        eq(userFilterTexts.text, text),
      ),
    );
}

/** Replace all wishes/dealbreakers for a user - used by the form-based edit page. */
export async function replaceTexts(
  userId: string,
  kind: FilterTextKind,
  texts: string[],
): Promise<void> {
  const db = getDb();
  const cleaned = Array.from(new Set(texts.map((t) => t.trim()).filter(Boolean)));
  await upsertFilters(userId, kind === "wish" ? { wishes: cleaned } : { dealbreakers: cleaned });
  await db
    .delete(userFilterTexts)
    .where(and(eq(userFilterTexts.userId, userId), eq(userFilterTexts.kind, kind)));
  if (cleaned.length === 0) return;
  const rows = await Promise.all(
    cleaned.map(async (text) => {
      let embedding: number[] | null = null;
      try {
        embedding = await embedText(text);
      } catch (err) {
        log.warn("embed text failed", { kind, error: errorMessage(err) });
      }
      return { userId, kind, text, embedding };
    }),
  );
  await db.insert(userFilterTexts).values(rows);
}

export async function markOnboarded(userId: string): Promise<void> {
  await upsertFilters(userId, { onboardedAt: new Date(), isActive: true });
}

/** Counts active filters; mirrors the shared helper but uses the stored shape. */
export function countActive(f: StoredFilters): number {
  let count = 0;
  if (f.priceMaxNis != null || f.priceMinNis != null) count++;
  if (f.roomsMin != null || f.roomsMax != null) count++;
  if (f.sqmMin != null || f.sqmMax != null) count++;
  if (f.allowedNeighborhoods.length > 0) count++;
  if (f.blockedNeighborhoods.length > 0) count++;
  for (const a of f.attributes) {
    if (a.requirement !== "dont_care") count++;
  }
  if (f.dealbreakers.length > 0) count++;
  return count;
}

// Re-export keys for convenience in form rendering.
export { APARTMENT_ATTRIBUTE_KEYS };
