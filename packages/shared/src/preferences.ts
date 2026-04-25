import { z } from "zod";

export const AmenityPreference = z.enum(["any", "preferred", "required", "avoid"]);
export type AmenityPreference = z.infer<typeof AmenityPreference>;

export const AMENITY_KEYS = [
  "elevator",
  "parking",
  "balcony",
  "airConditioning",
  "furnished",
  "renovated",
  "petFriendly",
  "safeRoom",
  "storage",
  "accessible",
  "bars",
] as const;
export type AmenityKey = (typeof AMENITY_KEYS)[number];

export const AMENITY_LABELS: Record<AmenityKey, string> = {
  elevator: "Elevator",
  parking: "Parking",
  balcony: "Balcony",
  airConditioning: "Air conditioning",
  furnished: "Furnished",
  renovated: "Renovated / reconstructed",
  petFriendly: "Pet friendly",
  safeRoom: "Safe room (mamad)",
  storage: "Storage room",
  accessible: "Wheelchair accessible",
  bars: "Window bars",
};

const amenityShape = Object.fromEntries(
  AMENITY_KEYS.map((key) => [key, AmenityPreference.default("any")]),
) as Record<AmenityKey, z.ZodDefault<typeof AmenityPreference>>;

export const AmenityPreferencesSchema = z
  .object(amenityShape)
  .default(
    Object.fromEntries(AMENITY_KEYS.map((k) => [k, "any"])) as Record<
      AmenityKey,
      AmenityPreference
    >,
  );
export type AmenityPreferences = z.infer<typeof AmenityPreferencesSchema>;

export const PreferencesSchema = z.object({
  budget: z.object({
    maxNis: z.number().int().positive(),
    minNis: z.number().int().nonnegative().default(0),
    flexibilityPct: z.number().min(0).max(100).default(10),
  }),
  rooms: z.object({
    min: z.number().min(1),
    max: z.number().min(1),
  }),
  sizeSqm: z
    .object({
      min: z.number().int().positive().optional(),
      max: z.number().int().positive().optional(),
    })
    .optional(),
  allowedNeighborhoods: z.array(z.string()).default([]),
  blockedNeighborhoods: z.array(z.string()).default([]),
  hardRequirements: z.array(z.string()).default([]),
  niceToHaves: z.array(z.string()).default([]),
  dealBreakers: z.array(z.string()).default([]),
  amenities: AmenityPreferencesSchema,
  maxAgeHours: z.number().int().positive().default(24),
  ai: z
    .object({
      scoreThreshold: z.number().min(0).max(100).default(70),
      primaryModel: z.string().default("google/gemini-2.5-flash"),
      escalationModel: z.string().default("google/gemini-2.5-flash"),
    })
    .default({
      scoreThreshold: 70,
      primaryModel: "google/gemini-2.5-flash",
      escalationModel: "google/gemini-2.5-flash",
    }),
  alerts: z.object({
    email: z
      .object({
        enabled: z.boolean().default(false),
        targets: z.array(z.string().email()).default([]),
        to: z.string().email().optional(),
        runSummaryEnabled: z.boolean().default(false),
        topPicksEnabled: z.boolean().default(false),
      })
      .default({ enabled: false }),
  }),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export const PreferencesPatchSchema = PreferencesSchema.deepPartial();
export type PreferencesPatch = z.infer<typeof PreferencesPatchSchema>;

export const defaultPreferences: Preferences = PreferencesSchema.parse({
  budget: { maxNis: 8000, minNis: 2000, flexibilityPct: 10 },
  rooms: { min: 2, max: 4 },
  allowedNeighborhoods: [],
  blockedNeighborhoods: [],
  hardRequirements: [],
  niceToHaves: [],
  dealBreakers: [],
  amenities: {},
  maxAgeHours: 24,
  ai: {
    scoreThreshold: 70,
    primaryModel: "google/gemini-2.5-flash",
    escalationModel: "google/gemini-2.5-flash",
  },
  alerts: {
    email: {
      enabled: false,
      targets: [],
      runSummaryEnabled: false,
      topPicksEnabled: false,
    },
  },
});
