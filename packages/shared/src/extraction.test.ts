import { describe, expect, test } from "vitest";
import { ExtractionSchema, type Extracted } from "./extraction";
import { APARTMENT_ATTRIBUTE_KEYS } from "./filters";

// ---------------------------------------------------------------------------
// Lean extraction schema. Structured fields + an array of {key, value:bool}
// for known attributes. Unknown attributes are simply absent — no NULL.
// ---------------------------------------------------------------------------

describe("ExtractionSchema: structured fields", () => {
  test("accepts a fully populated extraction with attributes", () => {
    const sample: Extracted = {
      priceNis: 7500,
      rooms: 2.5,
      sqm: 60,
      floor: 3,
      rawAddress: "Herzl 12, Florentin, Tel Aviv",
      street: "Herzl",
      houseNumber: "12",
      neighborhood: "Florentin",
      city: "Tel Aviv",
      description: "Renovated 2.5-room apartment near park",
      condition: "renovated",
      isAgency: false,
      phoneE164: "+972501234567",
      arnonaNis: 500,
      vaadBayitNis: 200,
      entryDate: "מיידי",
      balconySqm: 5,
      totalFloors: 5,
      furnitureStatus: "included",
      attributes: [
        { key: "elevator", value: true },
        { key: "parking", value: false },
        { key: "garden", value: true },
        { key: "pool", value: false },
        { key: "solar_water_heater", value: true },
      ],
      extras: { customNote: "near park" },
    };
    expect(() => ExtractionSchema.parse(sample)).not.toThrow();
  });

  test("accepts an all-null structured extraction with empty attributes", () => {
    const allNull: Extracted = {
      priceNis: null,
      rooms: null,
      sqm: null,
      floor: null,
      rawAddress: null,
      street: null,
      houseNumber: null,
      neighborhood: null,
      city: null,
      description: null,
      condition: null,
      isAgency: null,
      phoneE164: null,
      arnonaNis: null,
      vaadBayitNis: null,
      entryDate: null,
      balconySqm: null,
      totalFloors: null,
      furnitureStatus: null,
      attributes: [],
      extras: null,
    };
    expect(() => ExtractionSchema.parse(allNull)).not.toThrow();
  });

  test("priceNis and floor must be integers", () => {
    expect(() => ExtractionSchema.parse(baseExtraction({ priceNis: 7500.5 }))).toThrow();
    expect(() => ExtractionSchema.parse(baseExtraction({ floor: 2.5 }))).toThrow();
  });

  test("rooms allows fractional values", () => {
    expect(() => ExtractionSchema.parse(baseExtraction({ rooms: 2.5 }))).not.toThrow();
  });

  test("arnonaNis and balconySqm must be integers", () => {
    expect(() => ExtractionSchema.parse(baseExtraction({ arnonaNis: 500.5 }))).toThrow();
    expect(() => ExtractionSchema.parse(baseExtraction({ balconySqm: 5.5 }))).toThrow();
  });

  test("furnitureStatus accepts only the three known values", () => {
    expect(() =>
      ExtractionSchema.parse(baseExtraction({ furnitureStatus: "included" })),
    ).not.toThrow();
    expect(() =>
      ExtractionSchema.parse(baseExtraction({ furnitureStatus: "partial" })),
    ).not.toThrow();
    expect(() =>
      ExtractionSchema.parse(baseExtraction({ furnitureStatus: "not_included" })),
    ).not.toThrow();
    expect(() =>
      ExtractionSchema.parse(baseExtraction({ furnitureStatus: "yes" as never })),
    ).toThrow();
  });
});

describe("ExtractionSchema: attributes", () => {
  test("rejects unknown attribute keys", () => {
    expect(() =>
      ExtractionSchema.parse(
        baseExtraction({
          attributes: [{ key: "not_a_real_key" as never, value: true }],
        }),
      ),
    ).toThrow();
  });

  test("requires value to be a strict boolean (no null)", () => {
    expect(() =>
      ExtractionSchema.parse(
        baseExtraction({
          attributes: [{ key: "elevator", value: null as never }],
        }),
      ),
    ).toThrow();
  });

  test("accepts every known attribute key", () => {
    const sample = baseExtraction({
      attributes: APARTMENT_ATTRIBUTE_KEYS.map((key) => ({ key, value: true })),
    });
    expect(() => ExtractionSchema.parse(sample)).not.toThrow();
  });
});

function baseExtraction(overrides: Partial<Extracted> = {}): Extracted {
  return {
    priceNis: null,
    rooms: null,
    sqm: null,
    floor: null,
    rawAddress: null,
    street: null,
    houseNumber: null,
    neighborhood: null,
    city: null,
    description: null,
    condition: null,
    isAgency: null,
    phoneE164: null,
    arnonaNis: null,
    vaadBayitNis: null,
    entryDate: null,
    balconySqm: null,
    totalFloors: null,
    furnitureStatus: null,
    attributes: [],
    extras: null,
    ...overrides,
  };
}
