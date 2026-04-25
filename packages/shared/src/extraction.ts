import { z } from "zod";
import { AMENITY_KEYS } from "./preferences";

// Re-export so consumers can import the canonical amenity list straight from
// the extraction module without needing a second import path.
export { AMENITY_KEYS } from "./preferences";

// ---------------------------------------------------------------------------
// Shared extraction schema (P2).
//
// Single source of truth for the AI extractor (apps/web/src/pipeline/extract.ts)
// and for downstream consumers that read `extractions` rows.
//
// Tri-state amenities: each `has*` field is `boolean | null`.
//   - true  → explicitly stated true ("has elevator", "מעלית קיים").
//   - false → explicitly stated false ("no elevator", "אין מעלית").
//   - null  → unknown / not mentioned.
//
// Snake_case mirrors of these keys are exposed via EXTRACTED_AMENITY_HAS_KEYS
// for downstream consumers that operate on DB column names. The DB column
// names are mirrored on `extractions` and `canonical_attributes`.
// ---------------------------------------------------------------------------

/**
 * Convert a camelCase amenity key (e.g., "airConditioning") into the
 * snake_case `has_*` form used by Postgres column names (e.g.,
 * "has_air_conditioning"). Re-derived rather than hard-coded so the array
 * stays in lock-step with AMENITY_KEYS.
 */
function camelToHasSnake(key: string): string {
  const snake = key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
  return `has_${snake}`;
}

export const EXTRACTED_AMENITY_HAS_KEYS = AMENITY_KEYS.map(camelToHasSnake) as readonly string[];

const triStateBoolean = z.boolean().nullable();

// The 11 amenity has* fields are listed explicitly so TypeScript can infer
// the shape literally (matches the camelCase mirror of AMENITY_KEYS in
// `packages/shared/src/preferences.ts`). A schema-level test
// (`extraction.test.ts`) keeps this list in lock-step with AMENITY_KEYS.
const AmenityShape = {
  hasElevator: triStateBoolean,
  hasParking: triStateBoolean,
  hasBalcony: triStateBoolean,
  hasAirConditioning: triStateBoolean,
  hasFurnished: triStateBoolean,
  hasRenovated: triStateBoolean,
  hasPetFriendly: triStateBoolean,
  hasSafeRoom: triStateBoolean,
  hasStorage: triStateBoolean,
  hasAccessible: triStateBoolean,
  hasBars: triStateBoolean,
} as const;

export const ExtractionSchema = z.object({
  // Core typed fields. Each is nullable so the LLM can signal "unknown".
  priceNis: z.number().int().nullable(),
  rooms: z.number().nullable(),
  sqm: z.number().int().nullable(),
  floor: z.number().int().nullable(),
  street: z.string().nullable(),
  houseNumber: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  // Free-text — the LLM picks vocabulary (e.g., "renovated" / "original" / "shell").
  condition: z.string().nullable(),
  isAgency: z.boolean().nullable(),
  // E.164 format if extractable, e.g. "+972501234567".
  phoneE164: z.string().nullable(),
  // 11 tri-state amenity flags, mirrored from AMENITY_KEYS.
  ...AmenityShape,
  // JSONB pass-through for experimental attributes that have not yet
  // graduated to a typed column.
  extras: z.record(z.string(), z.unknown()).nullable(),
});

export type Extracted = z.infer<typeof ExtractionSchema>;
