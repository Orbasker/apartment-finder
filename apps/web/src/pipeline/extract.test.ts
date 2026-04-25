import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Extracted } from "@apartment-finder/shared";

// ---------------------------------------------------------------------------
// P2 shared extractor — extractApartment(input) wraps the AI SDK's
// generateObject with a Zod-schema contract (ExtractionSchema), tri-state
// amenity reconciliation, dual-model escalation when the primary returns too
// many NULL amenities, and recordAiUsage cost tracking.
//
// We mock the `ai` module at the boundary so tests do not hit the real model.
// recordAiUsage is mocked to assert feature tags without touching the DB.
// ---------------------------------------------------------------------------

const generateObjectMock = vi.fn<(arg: unknown) => Promise<unknown>>();
const recordAiUsageMock = vi.fn<(arg: { feature: string }) => Promise<void>>();

vi.mock("ai", async () => {
  return {
    generateObject: (arg: unknown) => generateObjectMock(arg),
  };
});

vi.mock("@/lib/gateway", () => ({
  isGatewayConfigured: () => true,
  model: (id: string) => ({ __mockModelId: id }),
}));

vi.mock("@/lib/aiUsage", () => ({
  recordAiUsage: (arg: { feature: string }) => recordAiUsageMock(arg),
}));

import { extractApartment } from "./extract";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function withOverrides(over: Partial<Extracted>): Extracted {
  return { ...allNull, ...over };
}

function mockGenerateObjectResolved(extracted: Extracted, modelId = "google/gemini-2.5-flash") {
  generateObjectMock.mockResolvedValueOnce({
    object: extracted,
    response: { modelId },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  generateObjectMock.mockReset();
  recordAiUsageMock.mockReset();
  recordAiUsageMock.mockImplementation(async () => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("extractApartment: Yad2 happy path", () => {
  test("returns the populated extraction without escalation and records AI usage", async () => {
    const fullExtraction = withOverrides({
      priceNis: 7500,
      rooms: 2.5,
      sqm: 55,
      floor: 2,
      street: "Herzl",
      neighborhood: "Florentin",
      city: "Tel Aviv",
      condition: "renovated",
      isAgency: false,
      hasElevator: true,
      hasParking: true,
      hasBalcony: true,
      hasAirConditioning: true,
      hasFurnished: false,
      hasRenovated: true,
      hasPetFriendly: false,
      hasSafeRoom: true,
      hasStorage: false,
      hasAccessible: false,
      hasBars: true,
    });
    mockGenerateObjectResolved(fullExtraction);

    const result = await extractApartment({
      rawText: "Yad2 listing: 2.5 rooms, Herzl 12, Florentin, ₪7500, balcony, elevator, parking",
      sourceType: "yad2",
    });

    expect(result.escalated).toBe(false);
    expect(result.extracted).toEqual(fullExtraction);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(recordAiUsageMock).toHaveBeenCalledTimes(1);
    const firstCallArg = recordAiUsageMock.mock.calls[0]?.[0];
    expect(firstCallArg).toBeDefined();
    expect(firstCallArg).toMatchObject({ feature: "pipeline.extract" });
  });
});

describe("extractApartment: FB happy path", () => {
  test("returns mostly-populated extraction from a Hebrew free-text post (not escalated)", async () => {
    const fbExtraction = withOverrides({
      priceNis: 6200,
      rooms: 2,
      neighborhood: "פלורנטין",
      isAgency: false,
      hasElevator: false,
      hasParking: false,
      hasBalcony: true,
      hasAirConditioning: true,
      hasFurnished: true,
      hasRenovated: null,
      hasPetFriendly: null,
      hasSafeRoom: null,
      hasStorage: null,
      hasAccessible: null,
      hasBars: null,
    });
    mockGenerateObjectResolved(fbExtraction);

    const result = await extractApartment({
      rawText: "להשכרה דירת 2 חדרים בפלורנטין, מרפסת ומזגן, מרוהטת, 6200 ש״ח לחודש. ללא מתווכים.",
      sourceType: "fb_apify",
    });

    expect(result.escalated).toBe(false);
    expect(result.extracted.priceNis).toBe(6200);
    expect(result.extracted.hasBalcony).toBe(true);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    const firstCallArg = recordAiUsageMock.mock.calls[0]?.[0];
    expect(firstCallArg).toBeDefined();
    expect(firstCallArg).toMatchObject({ feature: "pipeline.extract" });
  });
});

describe("extractApartment: dual-model escalation", () => {
  test("escalates when primary returns >6 NULL amenities and records both usage events", async () => {
    const primarySparse = withOverrides({
      priceNis: 6000,
      rooms: 3,
      // Only 2 amenities populated → 9 NULL → triggers escalation (threshold: >6 NULL).
      hasBalcony: true,
      hasElevator: false,
    });
    const escalationFull = withOverrides({
      priceNis: 6000,
      rooms: 3,
      hasBalcony: true,
      hasElevator: false,
      hasParking: true,
      hasAirConditioning: true,
      hasFurnished: false,
      hasRenovated: true,
      hasPetFriendly: false,
      hasSafeRoom: true,
      hasStorage: false,
      hasAccessible: false,
      hasBars: true,
    });
    mockGenerateObjectResolved(primarySparse);
    mockGenerateObjectResolved(escalationFull, "google/gemini-2.5-pro");

    const result = await extractApartment({
      rawText: "Vague Hebrew post. 3 rooms. 6000 NIS.",
      sourceType: "fb_ext",
      escalationModelId: "google/gemini-2.5-pro",
    });

    expect(result.escalated).toBe(true);
    expect(result.model).toBe("google/gemini-2.5-pro");
    expect(result.extracted).toEqual(escalationFull);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expect(recordAiUsageMock).toHaveBeenCalledTimes(2);
    const features = recordAiUsageMock.mock.calls.map((c) => c[0]?.feature);
    expect(features).toEqual(["pipeline.extract", "pipeline.extract.escalation"]);
  });

  test("does NOT escalate when primary fills 5+ amenities (only 6 NULL — at threshold)", async () => {
    // 5 booleans set (not null) → 6 NULL → "more than 6 NULL" is FALSE → no escalation
    const primaryDecent = withOverrides({
      priceNis: 7000,
      rooms: 2,
      hasBalcony: true,
      hasElevator: true,
      hasAirConditioning: true,
      hasParking: false,
      hasFurnished: true,
      // remaining 6 amenities are NULL
    });
    mockGenerateObjectResolved(primaryDecent);

    const result = await extractApartment({
      rawText: "decent listing",
      sourceType: "yad2",
    });

    expect(result.escalated).toBe(false);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });
});

describe("extractApartment: invalid LLM response", () => {
  test("propagates errors thrown by generateObject (e.g., Zod parse failure)", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("LLM did not match schema"));
    await expect(
      extractApartment({
        rawText: "anything",
        sourceType: "yad2",
      }),
    ).rejects.toThrow(/did not match schema/);
    expect(recordAiUsageMock).not.toHaveBeenCalled();
  });
});

describe("extractApartment: empty rawText guard", () => {
  test("short-circuits with all-null extraction and never calls generateObject", async () => {
    const result = await extractApartment({
      rawText: "",
      sourceType: "yad2",
    });
    expect(result.escalated).toBe(false);
    expect(result.model).toBe("noop");
    expect(result.extracted).toEqual(allNull);
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(recordAiUsageMock).not.toHaveBeenCalled();
  });

  test("treats whitespace-only rawText as empty", async () => {
    const result = await extractApartment({
      rawText: "   \n\t  ",
      sourceType: "fb_apify",
    });
    expect(result.escalated).toBe(false);
    expect(result.model).toBe("noop");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });
});

describe("extractApartment: AMENITY_KEYS parity", () => {
  test("returned extraction object is shaped by ExtractionSchema (11 has_* booleans)", async () => {
    const filled = withOverrides({
      hasElevator: true,
      hasParking: true,
      hasBalcony: true,
      hasAirConditioning: true,
      hasFurnished: true,
      hasRenovated: true,
      hasPetFriendly: true,
      hasSafeRoom: true,
      hasStorage: true,
      hasAccessible: true,
      hasBars: true,
    });
    mockGenerateObjectResolved(filled);

    const result = await extractApartment({
      rawText: "fully populated listing",
      sourceType: "yad2",
    });

    const hasKeys = Object.keys(result.extracted).filter((k) => k.startsWith("has"));
    expect(hasKeys).toHaveLength(11);
  });
});

describe("extractApartment: usage tracking is non-blocking", () => {
  test("extraction succeeds even if recordAiUsage rejects", async () => {
    recordAiUsageMock.mockRejectedValueOnce(new Error("db down"));
    // Populate enough amenities so escalation does not fire (≤6 NULLs).
    const fullExtraction = withOverrides({
      priceNis: 7000,
      rooms: 2,
      hasBalcony: true,
      hasElevator: true,
      hasAirConditioning: true,
      hasParking: false,
      hasFurnished: true,
    });
    mockGenerateObjectResolved(fullExtraction);

    const result = await extractApartment({
      rawText: "yad2 listing",
      sourceType: "yad2",
    });
    expect(result.extracted.priceNis).toBe(7000);
  });
});
