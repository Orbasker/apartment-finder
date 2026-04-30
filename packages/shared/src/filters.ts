import { z } from "zod";

// ---------------------------------------------------------------------------
// Filter schema for the lean MVP. Mirrors the `user_filters` and
// `user_filter_attributes` tables. The chat agent and the /filters form both
// produce/consume this shape.
// ---------------------------------------------------------------------------

export const APARTMENT_ATTRIBUTE_KEYS = [
  "elevator",
  "parking",
  "balcony",
  "air_conditioning",
  "furnished",
  "renovated",
  "pet_friendly",
  "safe_room",
  "storage",
  "accessible",
  "bars",
  "ground_floor",
  "roof_access",
  "shared_apartment",
  "garden",
  "pool",
  "solar_water_heater",
] as const;
export type ApartmentAttributeKey = (typeof APARTMENT_ATTRIBUTE_KEYS)[number];

export const ApartmentAttributeKeySchema = z.enum(APARTMENT_ATTRIBUTE_KEYS);

// Hebrew labels for the /filters form. Free to translate.
export const APARTMENT_ATTRIBUTE_LABELS: Record<ApartmentAttributeKey, string> = {
  elevator: "מעלית",
  parking: "חניה",
  balcony: "מרפסת",
  air_conditioning: "מיזוג אוויר",
  furnished: "מרוהט",
  renovated: "משופץ",
  pet_friendly: "ידידותי לחיות מחמד",
  safe_room: "מרחב מוגן",
  storage: "מחסן",
  accessible: "נגיש לנכים",
  bars: "סורגים",
  ground_floor: "קומת קרקע",
  roof_access: "גישה לגג",
  shared_apartment: "דירת שותפים",
  garden: "גינה",
  pool: "בריכה",
  solar_water_heater: "דוד שמש",
};

export const AttributeRequirementSchema = z.enum([
  "required_true",
  "required_false",
  "preferred_true",
  "dont_care",
]);
export type AttributeRequirement = z.infer<typeof AttributeRequirementSchema>;

export const FilterAttributeSchema = z.object({
  key: ApartmentAttributeKeySchema,
  requirement: AttributeRequirementSchema,
});
export type FilterAttribute = z.infer<typeof FilterAttributeSchema>;

// City the user is searching in (Google Places `place_id` + Hebrew display name).
// Scopes the neighborhood pickers and is matched against `apartments.city`.
export const CitySelectionSchema = z.object({
  cityId: z.string().min(1),
  placeId: z.string().min(1),
  nameHe: z.string().min(1),
  nameEn: z.string().min(1),
});
export type CitySelection = z.infer<typeof CitySelectionSchema>;

// Each neighborhood selection caches Google Places' place_id + display name,
// plus the catalog city id and denormalized city name used at match time.
export const NeighborhoodSelectionSchema = z.object({
  placeId: z.string().min(1),
  nameHe: z.string().min(1),
  cityId: z.string().min(1),
  cityPlaceId: z.string().min(1),
  cityNameHe: z.string().min(1),
});
export type NeighborhoodSelection = z.infer<typeof NeighborhoodSelectionSchema>;

export const FiltersSchema = z.object({
  priceMinNis: z.number().int().nonnegative().nullable(),
  priceMaxNis: z.number().int().positive().nullable(),
  roomsMin: z.number().min(0).nullable(),
  roomsMax: z.number().min(0).nullable(),
  sqmMin: z.number().int().positive().nullable(),
  sqmMax: z.number().int().positive().nullable(),
  cities: z.array(CitySelectionSchema).default([]),
  allowedNeighborhoods: z.array(NeighborhoodSelectionSchema).default([]),
  blockedNeighborhoods: z.array(NeighborhoodSelectionSchema).default([]),
  wishes: z.array(z.string()).default([]),
  dealbreakers: z.array(z.string()).default([]),
  attributes: z.array(FilterAttributeSchema).default([]),
  strictUnknowns: z.boolean().default(false),
  notifyOnUnknownMustHave: z.boolean().default(true),
  dailyAlertCap: z.number().int().min(0).default(20),
  maxAgeHours: z.number().int().positive().default(48),
  isActive: z.boolean().default(true),
});
export type Filters = z.infer<typeof FiltersSchema>;

export const FiltersPatchSchema = FiltersSchema.partial();
export type FiltersPatch = z.infer<typeof FiltersPatchSchema>;

/** Counts only filters that meaningfully constrain the match - used to gate
 *  onboarding completion (≥3 needed). */
export function countActiveFilters(f: Filters): number {
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

export const defaultFilters: Filters = {
  priceMinNis: null,
  priceMaxNis: null,
  roomsMin: null,
  roomsMax: null,
  sqmMin: null,
  sqmMax: null,
  cities: [],
  allowedNeighborhoods: [],
  blockedNeighborhoods: [],
  wishes: [],
  dealbreakers: [],
  attributes: [],
  strictUnknowns: false,
  notifyOnUnknownMustHave: true,
  dailyAlertCap: 20,
  maxAgeHours: 48,
  isActive: true,
};
