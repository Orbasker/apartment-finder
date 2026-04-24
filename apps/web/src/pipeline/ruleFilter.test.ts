import { describe, expect, test } from "bun:test";
import type { NormalizedListing, Preferences } from "@apartment-finder/shared";
import { ruleFilter } from "./ruleFilter";

const basePrefs: Preferences = {
  budget: { maxNis: 8000, minNis: 0, flexibilityPct: 10 },
  rooms: { min: 2, max: 4 },
  allowedNeighborhoods: [],
  blockedNeighborhoods: [],
  hardRequirements: [],
  niceToHaves: [],
  dealBreakers: [],
  amenities: {
    elevator: "any",
    parking: "any",
    balcony: "any",
    airConditioning: "any",
    furnished: "any",
    renovated: "any",
    petFriendly: "any",
    safeRoom: "any",
    storage: "any",
    accessible: "any",
    bars: "any",
  },
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
};

const baseListing: NormalizedListing = {
  source: "yad2",
  sourceId: "abc",
  url: "https://example.com/abc",
  priceNis: 7500,
  rooms: 3,
  sqm: 70,
  neighborhood: "Florentin",
  postedAt: new Date(),
};

describe("ruleFilter", () => {
  test("passes a listing within budget and room range", () => {
    expect(ruleFilter(baseListing, basePrefs)).toEqual({ pass: true });
  });

  test("rejects a listing over budget (including flexibility)", () => {
    const result = ruleFilter({ ...baseListing, priceNis: 9001 }, basePrefs);
    expect(result.pass).toBe(false);
  });

  test("rejects a listing in a blocked neighborhood", () => {
    const result = ruleFilter(baseListing, {
      ...basePrefs,
      blockedNeighborhoods: ["florentin"],
    });
    expect(result.pass).toBe(false);
  });

  test("rejects a listing below the min room count", () => {
    const result = ruleFilter({ ...baseListing, rooms: 1 }, basePrefs);
    expect(result.pass).toBe(false);
  });

  test("rejects a listing below the min price (spam)", () => {
    const prefs = { ...basePrefs, budget: { ...basePrefs.budget, minNis: 3000 } };
    const result = ruleFilter({ ...baseListing, priceNis: 500 }, prefs);
    expect(result.pass).toBe(false);
    if (!result.pass) expect(result.reason).toMatch(/spam/);
  });

  test("accepts a listing at or above the min price", () => {
    const prefs = { ...basePrefs, budget: { ...basePrefs.budget, minNis: 3000 } };
    const result = ruleFilter({ ...baseListing, priceNis: 3000 }, prefs);
    expect(result.pass).toBe(true);
  });

  test("rejects a listing above the sqm max", () => {
    const prefs = { ...basePrefs, sizeSqm: { max: 60 } };
    const result = ruleFilter({ ...baseListing, sqm: 80 }, prefs);
    expect(result.pass).toBe(false);
  });
});
