import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  AMENITY_KEYS,
  EXTRACTED_AMENITY_HAS_KEYS,
  ExtractionSchema,
  type Extracted,
} from "./extraction";

// ---------------------------------------------------------------------------
// P2 shared extraction schema — tri-state amenities + core typed fields.
// The schema is the single source of truth used by both the AI extractor
// (apps/web/src/pipeline/extract.ts) and downstream consumers.
// ---------------------------------------------------------------------------

const expectedAmenityHasKeys = AMENITY_KEYS.map((key) => {
  const snake = key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
  return `has_${snake}`;
});

describe("ExtractionSchema: amenity keys", () => {
  test("EXTRACTED_AMENITY_HAS_KEYS exposes 11 snake_case has_* keys matching AMENITY_KEYS", () => {
    expect(EXTRACTED_AMENITY_HAS_KEYS).toHaveLength(11);
    expect([...EXTRACTED_AMENITY_HAS_KEYS]).toEqual(expectedAmenityHasKeys);
  });

  test("schema has exactly 11 has_* nullable boolean fields, all camelCase, derived from AMENITY_KEYS", () => {
    const shape = ExtractionSchema.shape;
    const camelHasKeys = AMENITY_KEYS.map(
      (key) => `has${key.charAt(0).toUpperCase()}${key.slice(1)}`,
    );
    expect(camelHasKeys).toHaveLength(11);

    for (const camelHas of camelHasKeys) {
      const field = shape[camelHas as keyof typeof shape];
      expect(field, `expected schema to expose ${camelHas}`).toBeDefined();
      // Must accept true/false/null
      expect(field.parse(true)).toBe(true);
      expect(field.parse(false)).toBe(false);
      expect(field.parse(null)).toBe(null);
    }
  });
});

describe("ExtractionSchema: core typed fields", () => {
  test("accepts a fully populated extraction", () => {
    const sample = {
      priceNis: 7500,
      rooms: 2.5,
      sqm: 60,
      floor: 3,
      street: "Herzl",
      houseNumber: "12",
      neighborhood: "Florentin",
      city: "Tel Aviv",
      condition: "renovated",
      isAgency: false,
      phoneE164: "+972501234567",
      hasElevator: true,
      hasParking: false,
      hasBalcony: true,
      hasAirConditioning: null,
      hasFurnished: null,
      hasRenovated: true,
      hasPetFriendly: null,
      hasSafeRoom: false,
      hasStorage: null,
      hasAccessible: null,
      hasBars: false,
      extras: { customNote: "near park" },
    };
    const parsed = ExtractionSchema.parse(sample);
    expect(parsed.priceNis).toBe(7500);
    expect(parsed.rooms).toBe(2.5);
    expect(parsed.condition).toBe("renovated");
    expect(parsed.hasElevator).toBe(true);
    expect(parsed.hasAirConditioning).toBeNull();
    expect(parsed.extras).toEqual({ customNote: "near park" });
  });

  test("accepts an all-null extraction (every field nullable)", () => {
    const allNull: Extracted = {
      priceNis: null,
      rooms: null,
      sqm: null,
      floor: null,
      street: null,
      houseNumber: null,
      neighborhood: null,
      city: null,
      condition: null,
      isAgency: null,
      phoneE164: null,
      hasElevator: null,
      hasParking: null,
      hasBalcony: null,
      hasAirConditioning: null,
      hasFurnished: null,
      hasRenovated: null,
      hasPetFriendly: null,
      hasSafeRoom: null,
      hasStorage: null,
      hasAccessible: null,
      hasBars: null,
      extras: null,
    };
    expect(() => ExtractionSchema.parse(allNull)).not.toThrow();
  });

  test("priceNis must be an integer", () => {
    const invalid = baseExtraction({ priceNis: 7500.5 });
    expect(() => ExtractionSchema.parse(invalid)).toThrow();
  });

  test("rooms allows fractional values (e.g. 2.5)", () => {
    const valid = baseExtraction({ rooms: 2.5 });
    expect(() => ExtractionSchema.parse(valid)).not.toThrow();
  });

  test("sqm and floor must be integers", () => {
    expect(() => ExtractionSchema.parse(baseExtraction({ sqm: 60.5 }))).toThrow();
    expect(() => ExtractionSchema.parse(baseExtraction({ floor: 2.5 }))).toThrow();
  });

  test("Extracted type infers correctly via z.infer", () => {
    const _t: Extracted = {
      priceNis: null,
      rooms: null,
      sqm: null,
      floor: null,
      street: null,
      houseNumber: null,
      neighborhood: null,
      city: null,
      condition: null,
      isAgency: null,
      phoneE164: null,
      hasElevator: null,
      hasParking: null,
      hasBalcony: null,
      hasAirConditioning: null,
      hasFurnished: null,
      hasRenovated: null,
      hasPetFriendly: null,
      hasSafeRoom: null,
      hasStorage: null,
      hasAccessible: null,
      hasBars: null,
      extras: null,
    };
    expect(_t.priceNis).toBeNull();
  });
});

describe("ExtractionSchema: extras JSONB lane", () => {
  test("accepts arbitrary record values", () => {
    const parsed = ExtractionSchema.parse(
      baseExtraction({ extras: { foo: "bar", nested: { count: 1 } } }),
    );
    expect(parsed.extras).toEqual({ foo: "bar", nested: { count: 1 } });
  });

  test("accepts null extras", () => {
    const parsed = ExtractionSchema.parse(baseExtraction({ extras: null }));
    expect(parsed.extras).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseExtraction(overrides: Partial<Extracted> = {}): Extracted {
  return {
    priceNis: null,
    rooms: null,
    sqm: null,
    floor: null,
    street: null,
    houseNumber: null,
    neighborhood: null,
    city: null,
    condition: null,
    isAgency: null,
    phoneE164: null,
    hasElevator: null,
    hasParking: null,
    hasBalcony: null,
    hasAirConditioning: null,
    hasFurnished: null,
    hasRenovated: null,
    hasPetFriendly: null,
    hasSafeRoom: null,
    hasStorage: null,
    hasAccessible: null,
    hasBars: null,
    extras: null,
    ...overrides,
  };
}

// Silence unused-import warnings while keeping the import (verifies re-export).
void z;
