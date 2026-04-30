"use server";

import { revalidatePath } from "next/cache";
import {
  APARTMENT_ATTRIBUTE_KEYS,
  type ApartmentAttributeKey,
  AttributeRequirementSchema,
  type AttributeRequirement,
} from "@apartment-finder/shared";
import { getCurrentUser } from "@/lib/auth-server";
import {
  markOnboarded,
  replaceAttributes,
  replaceCities,
  replaceNeighborhoods,
  replaceTexts,
  upsertFilters,
} from "@/filters/store";
import type { CitySelection, NeighborhoodSelection } from "@apartment-finder/shared";

function parseOptionalInt(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalNum(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseList(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCitySelections(formData: FormData, name: string): CitySelection[] {
  const out: CitySelection[] = [];
  for (const raw of formData.getAll(name)) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw) as Partial<CitySelection>;
      if (
        typeof parsed.cityId === "string" &&
        typeof parsed.placeId === "string" &&
        typeof parsed.nameHe === "string" &&
        typeof parsed.nameEn === "string" &&
        parsed.cityId &&
        parsed.placeId &&
        parsed.nameHe &&
        parsed.nameEn
      ) {
        out.push({
          cityId: parsed.cityId,
          placeId: parsed.placeId,
          nameHe: parsed.nameHe,
          nameEn: parsed.nameEn,
        });
      }
    } catch {
      // Skip malformed entries.
    }
  }
  return out;
}

function parseNeighborhoodSelections(formData: FormData, name: string): NeighborhoodSelection[] {
  const out: NeighborhoodSelection[] = [];
  for (const raw of formData.getAll(name)) {
    if (typeof raw !== "string") continue;
    try {
      const parsed = JSON.parse(raw) as Partial<NeighborhoodSelection>;
      if (
        typeof parsed.placeId === "string" &&
        typeof parsed.nameHe === "string" &&
        typeof parsed.cityId === "string" &&
        typeof parsed.cityPlaceId === "string" &&
        typeof parsed.cityNameHe === "string" &&
        parsed.placeId &&
        parsed.nameHe &&
        parsed.cityId &&
        parsed.cityPlaceId &&
        parsed.cityNameHe
      ) {
        out.push({
          placeId: parsed.placeId,
          nameHe: parsed.nameHe,
          cityId: parsed.cityId,
          cityPlaceId: parsed.cityPlaceId,
          cityNameHe: parsed.cityNameHe,
        });
      }
    } catch {
      // Skip malformed entries.
    }
  }
  return out;
}

export async function saveFiltersAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await upsertFilters(user.id, {
    priceMinNis: parseOptionalInt(formData.get("priceMinNis")),
    priceMaxNis: parseOptionalInt(formData.get("priceMaxNis")),
    roomsMin: parseOptionalNum(formData.get("roomsMin")),
    roomsMax: parseOptionalNum(formData.get("roomsMax")),
    sqmMin: parseOptionalInt(formData.get("sqmMin")),
    sqmMax: parseOptionalInt(formData.get("sqmMax")),
    strictUnknowns: formData.get("strictUnknowns") === "on",
    notifyOnUnknownMustHave: formData.get("notifyOnUnknownMustHave") === "on",
    isActive: formData.get("isActive") === "on",
    dailyAlertCap: parseOptionalInt(formData.get("dailyAlertCap")) ?? 20,
    maxAgeHours: parseOptionalInt(formData.get("maxAgeHours")) ?? 48,
  });

  // Cities must land first so the FK on user_filter_neighborhoods.city_id
  // is satisfied. Drop neighborhoods whose city wasn't submitted (e.g. left
  // over after a city was removed in the UI but the form somehow still has
  // them - shouldn't happen, but be defensive).
  const cities = parseCitySelections(formData, "cities");
  await replaceCities(user.id, cities);
  const cityIds = new Set(cities.map((c) => c.cityId));
  const allowed = parseNeighborhoodSelections(formData, "allowedNeighborhoods").filter((n) =>
    cityIds.has(n.cityId),
  );
  const blocked = parseNeighborhoodSelections(formData, "blockedNeighborhoods").filter((n) =>
    cityIds.has(n.cityId),
  );
  await replaceNeighborhoods(user.id, "allowed", allowed);
  await replaceNeighborhoods(user.id, "blocked", blocked);

  const attrs: Array<{ key: ApartmentAttributeKey; requirement: AttributeRequirement }> = [];
  for (const key of APARTMENT_ATTRIBUTE_KEYS) {
    const raw = formData.get(`attr-${key}`);
    if (typeof raw !== "string") continue;
    const parsed = AttributeRequirementSchema.safeParse(raw);
    if (!parsed.success) continue;
    attrs.push({ key, requirement: parsed.data });
  }
  await replaceAttributes(user.id, attrs);

  await replaceTexts(user.id, "wish", parseList(formData.get("wishes")));
  await replaceTexts(user.id, "dealbreaker", parseList(formData.get("dealbreakers")));

  // First save = onboarding complete (so /filters can be used as the onboarding alternative).
  await markOnboarded(user.id);

  revalidatePath("/filters");
  revalidatePath("/");
}
