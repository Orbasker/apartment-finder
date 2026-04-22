import { describe, expect, test } from "bun:test";
import type { NormalizedListing, Preferences } from "@apartment-finder/shared";
import { ruleFilter } from "./ruleFilter";

const basePrefs: Preferences = {
  budget: { maxNis: 8000, flexibilityPct: 10 },
  rooms: { min: 2, max: 4 },
  allowedNeighborhoods: [],
  blockedNeighborhoods: [],
  hardRequirements: [],
  niceToHaves: [],
  dealBreakers: [],
  maxAgeHours: 24,
  ai: {
    scoreThreshold: 70,
    primaryModel: "anthropic/claude-haiku-4-5",
    escalationModel: "anthropic/claude-sonnet-4-6",
  },
  alerts: {
    telegram: { enabled: true },
    email: { enabled: false },
    whatsapp: { enabled: false },
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
});
