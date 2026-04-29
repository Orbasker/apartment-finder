import { and, eq } from "drizzle-orm";
import {
  APARTMENT_ATTRIBUTE_KEYS,
  type ApartmentAttributeKey,
  type AttributeRequirement,
  type CitySelection,
  type Filters,
  type NeighborhoodSelection,
} from "@apartment-finder/shared";
import { getDb } from "@/db";
import {
  userFilterAttributes,
  userFilterCities,
  userFilterNeighborhoods,
  userFilterTexts,
  userFilters,
} from "@/db/schema";
import { embedText } from "@/ingestion/embed";
import { createLogger, errorMessage } from "@/lib/log";

const log = createLogger("filters:store");

export type FilterTextKind = "wish" | "dealbreaker";
export type NeighborhoodFilterKind = "allowed" | "blocked";

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
  const neighborhoodRows = await db
    .select({
      placeId: userFilterNeighborhoods.placeId,
      nameHe: userFilterNeighborhoods.nameHe,
      cityNameHe: userFilterNeighborhoods.cityNameHe,
      kind: userFilterNeighborhoods.kind,
    })
    .from(userFilterNeighborhoods)
    .where(eq(userFilterNeighborhoods.userId, userId));
  const allowedNeighborhoods: NeighborhoodSelection[] = neighborhoodRows
    .filter((n) => n.kind === "allowed")
    .map(({ placeId, nameHe, cityNameHe }) => ({ placeId, nameHe, cityNameHe }));
  const blockedNeighborhoods: NeighborhoodSelection[] = neighborhoodRows
    .filter((n) => n.kind === "blocked")
    .map(({ placeId, nameHe, cityNameHe }) => ({ placeId, nameHe, cityNameHe }));
  const cityRows = await db
    .select({ placeId: userFilterCities.placeId, nameHe: userFilterCities.nameHe })
    .from(userFilterCities)
    .where(eq(userFilterCities.userId, userId));
  const cities: CitySelection[] = cityRows.map(({ placeId, nameHe }) => ({ placeId, nameHe }));

  if (!row) {
    return {
      priceMinNis: null,
      priceMaxNis: null,
      roomsMin: null,
      roomsMax: null,
      sqmMin: null,
      sqmMax: null,
      cities,
      allowedNeighborhoods,
      blockedNeighborhoods,
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
    cities,
    allowedNeighborhoods,
    blockedNeighborhoods,
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

/** Replace the user's city allowlist with the given selections. */
export async function replaceCities(userId: string, selections: CitySelection[]): Promise<void> {
  const db = getDb();
  const seen = new Map<string, CitySelection>();
  for (const s of selections) {
    if (s.placeId.trim() && s.nameHe.trim()) seen.set(s.placeId, s);
  }
  await db.delete(userFilterCities).where(eq(userFilterCities.userId, userId));
  if (seen.size === 0) return;
  await db
    .insert(userFilterCities)
    .values(
      Array.from(seen.values()).map((s) => ({
        userId,
        placeId: s.placeId,
        nameHe: s.nameHe,
      })),
    )
    .onConflictDoNothing();
}

/** Add a single city to the user's allowlist. Used by the chat agent's chip click. */
export async function addCity(userId: string, city: CitySelection): Promise<void> {
  const db = getDb();
  await db
    .insert(userFilterCities)
    .values({ userId, placeId: city.placeId, nameHe: city.nameHe })
    .onConflictDoNothing();
}

/** Remove a single city from the user's allowlist. */
export async function removeCity(userId: string, placeId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(userFilterCities)
    .where(and(eq(userFilterCities.userId, userId), eq(userFilterCities.placeId, placeId)));
}

/** Replace the user's neighborhood selections of a given kind. */
export async function replaceNeighborhoods(
  userId: string,
  kind: NeighborhoodFilterKind,
  selections: NeighborhoodSelection[],
): Promise<void> {
  const db = getDb();
  const seen = new Map<string, NeighborhoodSelection>();
  for (const s of selections) {
    if (s.placeId.trim() && s.nameHe.trim() && s.cityNameHe.trim()) {
      seen.set(s.placeId, s);
    }
  }
  await db
    .delete(userFilterNeighborhoods)
    .where(and(eq(userFilterNeighborhoods.userId, userId), eq(userFilterNeighborhoods.kind, kind)));
  if (seen.size === 0) return;
  await db
    .insert(userFilterNeighborhoods)
    .values(
      Array.from(seen.values()).map((s) => ({
        userId,
        placeId: s.placeId,
        nameHe: s.nameHe,
        cityNameHe: s.cityNameHe,
        kind,
      })),
    )
    .onConflictDoNothing();
}

/** Add a single neighborhood selection. Used by the chat agent's chip click. */
export async function addNeighborhoodFilter(
  userId: string,
  kind: NeighborhoodFilterKind,
  selection: NeighborhoodSelection,
): Promise<void> {
  const db = getDb();
  await db
    .insert(userFilterNeighborhoods)
    .values({
      userId,
      placeId: selection.placeId,
      nameHe: selection.nameHe,
      cityNameHe: selection.cityNameHe,
      kind,
    })
    .onConflictDoNothing();
}

/** Remove a single neighborhood selection. Used by the chat agent. */
export async function removeNeighborhoodFilter(
  userId: string,
  kind: NeighborhoodFilterKind,
  placeId: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(userFilterNeighborhoods)
    .where(
      and(
        eq(userFilterNeighborhoods.userId, userId),
        eq(userFilterNeighborhoods.kind, kind),
        eq(userFilterNeighborhoods.placeId, placeId),
      ),
    );
}

/** Counts active filters; mirrors the shared helper but uses the stored shape. */
export function countActive(f: StoredFilters): number {
  let count = 0;
  if (f.priceMaxNis != null || f.priceMinNis != null) count++;
  if (f.roomsMin != null || f.roomsMax != null) count++;
  if (f.sqmMin != null || f.sqmMax != null) count++;
  if (f.cities.length > 0) count++;
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
