import { z } from "zod";
import { ApartmentAttributeKeySchema } from "./filters";

// ---------------------------------------------------------------------------
// Extraction schema (P3 rebuild). The AI extractor returns structured fields
// + an array of *known* attributes. Unknown attributes are simply not in the
// array — there's no NULL value, no tri-state. This mirrors the
// `listing_attributes` KV table where absence-of-row = unknown.
// ---------------------------------------------------------------------------

export const ExtractionAttributeSchema = z.object({
  key: ApartmentAttributeKeySchema,
  value: z.boolean(),
});
export type ExtractionAttribute = z.infer<typeof ExtractionAttributeSchema>;

export const FurnitureStatusSchema = z.enum(["included", "partial", "not_included"]);
export type FurnitureStatus = z.infer<typeof FurnitureStatusSchema>;

export const FURNITURE_STATUS_LABELS: Record<FurnitureStatus, string> = {
  included: "כולל",
  partial: "חלקי",
  not_included: "לא כולל",
};

export const ExtractionSchema = z.object({
  // Structured numeric/text fields.
  priceNis: z.number().int().nullable(),
  rooms: z.number().nullable(),
  sqm: z.number().int().nullable(),
  floor: z.number().int().nullable(),
  // Address — what the AI saw before geocoding.
  rawAddress: z.string().nullable(),
  street: z.string().nullable(),
  houseNumber: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  // Open-text
  description: z.string().nullable(),
  condition: z.string().nullable(),
  // Misc
  isAgency: z.boolean().nullable(),
  phoneE164: z.string().nullable(),
  // Additional structured fields shown in the email "מידע נוסף על הנכס" table.
  arnonaNis: z.number().int().nullable(),
  vaadBayitNis: z.number().int().nullable(),
  entryDate: z.string().nullable(),
  balconySqm: z.number().int().nullable(),
  totalFloors: z.number().int().nullable(),
  furnitureStatus: FurnitureStatusSchema.nullable(),
  // Boolean attributes the AI was confident about. Omit any attribute the AI
  // could not determine — absence ≠ false; it means "unknown".
  attributes: z.array(ExtractionAttributeSchema).default([]),
  extras: z.record(z.string(), z.unknown()).nullable(),
});
export type Extracted = z.infer<typeof ExtractionSchema>;
